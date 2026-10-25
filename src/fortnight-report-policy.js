import {roleForDepartment} from './leave-policy.js';
const DEPTS=['politie','ambulance','brandweer','depannage'];
const MS=86400000;
// Fixed Monday anchor; every resulting interval has precisely fourteen days.
// The first automated period starts 12 October 2026.
const ANCHOR='2026-10-12';
const datestr=d=>new Date(d).toISOString().slice(0,10);
const utcDay=s=>{
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const ms=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(ms)&&datestr(ms)===s?ms:null;
};
export function fortnightFor(date,department){
  if(!DEPTS.includes(department))throw Error('Ongeldige dienst');
  const dateMs=utcDay(date),anchor=utcDay(ANCHOR);
  if(dateMs===null)throw Error('Ongeldige rapportdatum');
  const elapsed=Math.floor((dateMs-anchor)/MS);
  const serial=Math.floor(elapsed/14),start=anchor+serial*14*MS;
  return {department,periodStart:datestr(start),periodEnd:datestr(start+13*MS),
    id:'F'+department+datestr(start).replaceAll('-','')};
}
export function automaticFortnightReports(dept,today,number=16){
  if(!DEPTS.includes(dept)||!Number.isInteger(number)||number<1||number>52)
    throw Error('Ongeldige aanvraag');
  const anchor=utcDay(ANCHOR);
  const now=utcDay(today);
  if(now===null)throw Error('Ongeldige rapportdatum');
  const current=fortnightFor(today,dept);
  let start=utcDay(current.periodStart);
  if(start<anchor)start=anchor;
  const results=[];
  for(let i=0;i<number&&start>=anchor;i++,start-=14*MS){
    const periodStart=datestr(start),periodEnd=datestr(start+13*MS);
    results.push({id:'F'+dept+periodStart.replaceAll('-',''),
      dept,title:'Automatisch tweewekelijks rapport · '+dept+' · '+periodStart,
      periodStart,periodEnd,status:now>start+13*MS?'afgesloten_periode':'lopende_periode',
      source:'automatic',createdBy:{name:'BelgiumPD · Automatisch'}});
  }
  return results;
}
export function parseAutomaticReportId(id){
  const m=/^F(politie|ambulance|brandweer|depannage)(\d{8})$/.exec(String(id||''));
  if(!m)return null;
  const day=m[2].slice(0,4)+'-'+m[2].slice(4,6)+'-'+m[2].slice(6,8);
  const date=utcDay(day),anchor=utcDay(ANCHOR);
  if(date===null||date<anchor||(date-anchor)%(14*MS)!==0)return null;
  const info=fortnightFor(day,m[1]);
  const base=automaticFortnightReports(m[1],day,1)[0];
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return base.id===id?
    {...base,periodEnd:info.periodEnd,
      status:info.periodEnd<today?'afgesloten_periode':'lopende_periode'}:null;
}
const matchesDuty=(person,pattern)=>[person?.call,person?.rank].some(value=>
  pattern.test(String(value||'').trim().toUpperCase().replace(/\s+/g,' ')));
const ownRecord=(actor,dept,roster)=>{
  if(!actor?.departments?.includes(dept)||!/^\d{15,22}$/.test(actor.discordId||''))return null;
  const mine=(roster||[]).filter(p=>p.dept===dept&&p.personId===actor.discordId);
  return mine.length===1?mine[0]:null;
};
export function mayReadFortnightReport(actor,dept,roster){
  if(!DEPTS.includes(dept)||!actor?.departments?.includes(dept))return false;
  const scoped=roleForDepartment(actor,dept);
  if(dept==='politie')return ['officierenkader','korpsleiding'].includes(scoped);
  const person=ownRecord(actor,dept,roster);
  if(!person)return false;
  if(dept==='brandweer')return actor.fireZoneChief===true;
  // A Police officer who is also an Ambulance member is NOT an AZLS leader.
  // A protected, uniquely mapped ambulance record and actual medical
  // leadership (AZLS Discord role or official DIRMED duty) are both required.
  if(actor.uid!=='discord:'+actor.discordId||actor.portalTechnicalMode===true)
    return false;
  if(dept==='ambulance')return actor.reportServiceRoles?.ambulanceAzls===true||
    matchesDuty(person,/^DIRMED(?:[- ]?\d{1,4})?$/);
  // AWV/ANWV duty or the fresh AWV Discord role is service-specific proof,
  // independent from unrelated Police rank or a generic portal cadre grant.
  if(dept==='depannage')return actor.reportServiceRoles?.depannageAwv===true||
    matchesDuty(person,/^(?:(?:AWV|ANWV)(?:[- ]?\d{1,4}|[ -]LEIDING)?|AGENTSCHAP WEGEN (?:EN|&) VERKEER(?:[ -]\(?LEIDING\)?)?)$/);
  return false;
}
export function fortnightReportDepartments(actor,roster){
  return DEPTS.filter(d=>mayReadFortnightReport(actor,d,roster));
}

/**
 * Reports are readable under service-specific rules, but deleting a police
 * report from the overview requires an explicitly verified police officer
 * or corps-leadership grant. This never extends delete rights to other depts.
 */
export function mayRemoveWeekReport(actor,dept,roster){
  return dept==='politie'&&mayReadFortnightReport(actor,dept,roster);
}

/** Period archive is a navigational grouping, not an immutable snapshot. */
export function splitReportsByPeriod(reports,today){
  if(utcDay(today)===null)throw Error('Ongeldige rapportdatum');
  const active=[],archive=[];
  for(const report of reports){
    if(utcDay(report?.periodEnd)===null)continue;
    (report.periodEnd<today?archive:active).push(report);
  }
  return {active,archive};
}

/**
 * An active automatically generated fortnight is never permanently removed:
 * its data comes from live dossier records. Historical/manual reports may be
 * hidden, while existing removal audit documents remain untouched.
 */
export function isCurrentAutomaticReport(report,today){
  if(!report||report.source!=='automatic'||!DEPTS.includes(report.dept)||
     utcDay(today)===null)return false;
  return report.id===fortnightFor(today,report.dept).id;
}
export function visibleFortnightReports(reports,removedIds,today){
  return reports.filter(report=>
    !removedIds.has(report.id)||isCurrentAutomaticReport(report,today));
}

/** A manual restart resets only the live report presentation, never the
 * underlying personnel dossier or immutable audit events. Any record with
 * missing creation metadata is treated as historical (excluded). */
export function includedAfterReportRestart(createdAt,restartedAt){
  if(restartedAt==null)return true;
  const millis=value=>value?.toMillis?.()||
    (value instanceof Date?value.getTime():null);
  const first=millis(createdAt),cutoff=millis(restartedAt);
  return Number.isFinite(first)&&Number.isFinite(cutoff)&&first>=cutoff;
}
