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
  const current=fortnightFor(now,dept);
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
  return automaticFortnightReports(m[1],day,1)[0].id===id?
    {...automaticFortnightReports(m[1],day,1)[0],periodEnd:info.periodEnd}:null;
}
const dutyCode=p=>String(p?.call||p?.rank||'').trim().toUpperCase().replace(/\s+/g,' ');
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
  if(dept==='ambulance')return ['middenkader','officierenkader','korpsleiding'].includes(scoped)||
    /^DIRMED(?:[- ]?\d{1,4})?$/.test(dutyCode(person));
  if(dept==='depannage')return ['middenkader','officierenkader','korpsleiding'].includes(scoped)&&
    /^(?:AWV(?:[- ]?\d{1,4})?|ANWV(?:[- ]?\d{1,4})?|AGENTSCHAP WEGEN (?:EN|&) VERKEER)$/.test(dutyCode(person));
  return false;
}
export function fortnightReportDepartments(actor,roster){
  return DEPTS.filter(d=>mayReadFortnightReport(actor,d,roster));
}
