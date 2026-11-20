// Kaderactiviteit: uitsluitend server-gecontroleerde, dienstgebonden inzage.
import {policeKader} from './normalize.js';
import {verifiedPoliceRankAuthority} from './personnel-rank-policy.js';
import {mayReadFortnightReport} from './fortnight-report-policy.js';

export const CADRE_ACTIVITY_SETTINGS_COLLECTION='bpd_cadre_activity_settings';
export const CADRE_ACTIVITY_SETTINGS_DOC='visibility';
export const CADRE_ACTIVITY_DEPARTMENTS=Object.freeze([
 'politie','brandweer','ambulance','depannage','burger'
]);
export const CADRE_ACTIVITY_OPTIONAL=Object.freeze(
 CADRE_ACTIVITY_DEPARTMENTS.filter(d=>d!=='politie'));
const DISCORD=/^\d{15,22}$/;
export const cadreActivityDefaults=()=>Object.fromEntries(
 CADRE_ACTIVITY_DEPARTMENTS.map(d=>[d,d==='politie']));
export function cadreActivitySettings(raw){
 const enabled=cadreActivityDefaults();
 for(const d of CADRE_ACTIVITY_OPTIONAL)enabled[d]=raw?.enabled?.[d]===true;
 return {enabled,revision:Number.isSafeInteger(raw?.revision)&&raw.revision>=0?
   raw.revision:0};
}
export function canManageCadreActivity(actor){
 // Neither a generic dashboard label nor a Police callsign grants this.
 // Technical mode retains only independently verified operational Police rank.
 return Boolean(verifiedPoliceRankAuthority(actor));
}
export function canReadCadreActivity(actor,dept,settings,roster){
 if(!CADRE_ACTIVITY_DEPARTMENTS.includes(dept)||!DISCORD.test(actor?.discordId||'')||
    actor.uid!=='discord:'+actor.discordId)return false;
 if(canManageCadreActivity(actor)){
   // Police leadership can manage switches; other-service record visibility
   // still requires an independently scoped personnel/dossier grant.
   return dept==='politie'||actor.dossierAllowedDepartments?.includes(dept)===true;
 }
 if(dept==='politie'||!cadreActivitySettings(settings).enabled[dept])return false;
 if(dept==='burger')return actor.citizenCouncilVerified===true&&
   actor.departments?.includes('burger')===true;
 return mayReadFortnightReport(actor,dept,roster);
}
export function validateCadreActivityToggle(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(x=>!['department','enabled','reason','expectedRevision'].includes(x)))
    throw Error('Ongeldige instelling');
 if(!CADRE_ACTIVITY_OPTIONAL.includes(raw.department))
   throw Error('Politie blijft altijd zichtbaar; kies een nevendienst');
 if(typeof raw.enabled!=='boolean')throw Error('Ongeldige zichtbaarheidskeuze');
 if(typeof raw.reason!=='string'||raw.reason.trim().length<10||
   raw.reason.length>300||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw.reason))
   throw Error('Vul een motivering van 10 tot 300 tekens in');
 if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)
   throw Error('De instellingen zijn gewijzigd; laad opnieuw');
 return {department:raw.department,enabled:raw.enabled,
   reason:raw.reason.trim(),expectedRevision:raw.expectedRevision};
}
export function isCadreActivitySubject(p){
 if(!p||!DISCORD.test(p.personId||'')||
   p.lifecycleState==='archived'||p.lifecycleState==='pending'||
   /^(?:verwijderd|ontslag|blacklisted)$/i.test(String(p.status||'')))return false;
 const rank=String(p.rank||'').trim(),call=String(p.call||'').trim();
 if(p.dept==='politie')
   return policeKader(rank,call)==='Middenkader' &&
     /^(?:S[- ]?)?[678]\d{2}$/i.test(call);
 if(p.dept==='brandweer')
   return /(?:sergeant|adjudant|luitenant|kapitein|majoor|kolonel|zonechef)/i.test(rank);
 if(p.dept==='ambulance')
   return /^(?:(?:HARTS|HVPK|HAMB|DIRMED|AZLS)(?:[- ]?\d{1,4})?)$/i.test(call)||
     /(?:azls|hoofdarts|hoofdverpleegkundige|hoofdambulancier|dir.?med)/i.test(rank);
 if(p.dept==='depannage')
   return /^(?:AWV|ANWV)(?:[- ]?\d{1,4})?$/i.test(call)||
     /\b(?:AWV|leiding)\b/i.test(rank);
 if(p.dept==='burger')
   return /burgerraad/i.test(rank);
 return false;
}
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
export function cadreActivityPeriod(value,today){
 if(!validDate(today))throw Error('Ongeldige peildatum');
 const days=Number(value);
 if(![7,30,90,365].includes(days))throw Error('Ongeldige periode');
 const start=new Date(Date.parse(today+'T12:00:00Z')-(days-1)*86400000)
   .toISOString().slice(0,10);
 return {start,end:today,days};
}
export function cadreActivityCounts(people,cases,trainings,period){
 const byId=new Map(people.map(p=>[p.personId,{
   discordId:p.personId,name:p.name,call:p.call||'',rank:p.rank||'',series:p.series||'',
   observaties:0,notities:0,sancties:0,opvolgingen:0,overig:0,
   opleidingsregistraties:0,overgenomen:0,correcties:0,dagen:new Set()
 }]));
 const hits=()=>Object.fromEntries([...byId].map(([id,value])=>[id,value]));
 for(const e of cases){
   if(!e||!validDate(e.eventDate)||e.eventDate<period.start||e.eventDate>period.end)
     continue;
   const original=e.registeredBy?.discordId;
   const importer=e.submittedByActor?.discordId;
   if(e.historicalImport===true){
     const recorder=byId.get(importer);
     if(recorder)recorder.overgenomen++;
     continue;
   }
   const amendment=Boolean(e.amendmentOf||e.retirementOf||
      /(?:amendment|correction|retirement)/.test(e.source||''));
   const recipient=byId.get(amendment?original:original);
   if(!recipient)continue;
   if(amendment){recipient.correcties++;continue}
   if(e.deletedAt||e.retiredAt||e.status==='verwijderd'||e.testRecord===true)
     continue;
   const map={
     observatie:'observaties',notitie:'notities',algemene_notitie:'notities',
     sanctie:'sancties',inactiviteitsping:'opvolgingen',
     activiteit:'opvolgingen'
   };
   const category=map[e.type]||'overig';
   recipient[category]++;
   recipient.dagen.add(e.eventDate);
 }
 for(const r of trainings){
   if(!r||!validDate(r.eventDate)||r.eventDate<period.start||
     r.eventDate>period.end||r.archivedAt||r.status==='archived')continue;
   const person=byId.get(r.registeredByDiscordId);
   if(!person)continue;
   person.opleidingsregistraties++;
   person.dagen.add(r.eventDate);
 }
 return Object.values(hits()).map(({dagen,...p})=>({
   ...p,actieveRegistratiedagen:dagen.size,
   totaal:p.observaties+p.notities+p.sancties+p.opvolgingen+p.overig+
     p.opleidingsregistraties
 })).sort((a,b)=>b.totaal-a.totaal||a.name.localeCompare(b.name,'nl-BE'));
}
