import { policeKader } from './normalize.js';
// Autorisatie en validatie: geen client-claims over rol of de identiteit van de indiener.
export const ALLOWED_ROLES = ['basiskader','middenkader','officierenkader','korpsleiding','burger','beheerder'];
export const SANCTION_REASONS = [
  'Radioprotocol','Rijstijl','Onrechtmatig gebruik dienstspecifiek voertuig',
  'Onrechtmatig gebruik collectief / dienstspecifiek wapen',
  'Onterecht (vuur)wapengebruik','Veiligheid','Schelden/pesten',
  'Buiten bevoegdheid treden (intern)','Buiten bevoegdheid treden (extern)',
  'Ongeoorloofde toe-eigening van een graad',
  'Ongeoorloofde toe-eigening van een specialisatie','Anders'
];
// Kaderbeleid: eerste drie maatregelen zelfstandig; voorstel tot degradatie vanaf ernst 9/10.
// Effectieve degradatie, schorsing en (geblackliste) ontslagen uitsluitend korpsleiding.
export const SANCTION_TYPES = [
  'Mondelinge waarschuwing', 'Officiële waarschuwing', 'Tijdelijke beperking',
  'Voorstel tot degradatie', 'Degradatie', 'Schorsing', 'Ontslag', 'Ontslag met blacklisting'
];
export const HEAVY_SANCTION_TYPES = ['Degradatie','Schorsing','Ontslag','Ontslag met blacklisting'];
export const isDiscordId = id => /^\d{15,22}$/.test(String(id??''));
export const isCadre = role => ['middenkader','officierenkader','korpsleiding','beheerder'].includes(role);
export const canChooseSanction=(role,kind,severity=null)=>{
  if(!['middenkader','officierenkader','korpsleiding'].includes(role)||!SANCTION_TYPES.includes(kind))return false;
  if(HEAVY_SANCTION_TYPES.includes(kind))return role==='korpsleiding';
  if(kind==='Voorstel tot degradatie')return Number.isInteger(severity)&&severity>=9&&severity<=10;
  return true;
};
export const permittedSanctionTypes=(role,severity)=>
  SANCTION_TYPES.filter(kind=>canChooseSanction(role,kind,severity));
export const canRepresent = (user,type,dept) => type==='observatie' && hasDept(user,dept) && (user?.portalTechnicalMode===true||['middenkader','officierenkader','korpsleiding'].includes(user?.role));
// Alleen politie-middenkaderleden als mogelijke vertegenwoordigde auteur; het is geen autorisatiebron.
export const eligibleRepresentative = (person,dept) => dept==='politie' && person?.dept===dept && isDiscordId(person?.personId) && policeKader(person.rank)==='Middenkader';
export function representativeFromPersonnel(persons,dept,id) {
  if(!isDiscordId(id)) return null;
  const matches=persons.filter(p=>p.personId===id && eligibleRepresentative(p,dept));
  if(matches.length!==1)return null;
  const p=matches[0];return {discordId:p.personId,name:p.name,call:p.call,rank:p.rank,dept:p.dept};
}
export const canEditSanction = role => ['officierenkader','korpsleiding'].includes(role);
export const hasDept = (user,dept) => Boolean(user?.departments?.includes(dept));
export const maySubmit = (user,type,dept) => hasDept(user,dept) && (
  (user?.dossierFullDepartments?.includes(dept)&&['observatie','sanctie'].includes(type)) ||
  type === 'observatie' || (type === 'sanctie' && (
    (dept === 'politie' && (user.portalTechnicalMode===true||
      ['middenkader','officierenkader','korpsleiding'].includes(user.role))) ||
    (dept === 'brandweer' && (user.portalTechnicalMode===true||user.fireZoneChief===true))
  ))
);
export const mayRead = (user,dept) => hasDept(user,dept) && isCadre(user.role);
export const mayAmend = (user,type,dept) => type === 'sanctie' && hasDept(user,dept) &&
  (user?.dossierFullDepartments?.includes(dept)||
   (user.portalTechnicalMode===true&&['politie','brandweer'].includes(dept))||
   (dept==='brandweer'&&user.fireZoneChief===true)||
   (dept==='politie'&&canEditSanction(user.role)));
const text=(value,max) => typeof value==='string' ? value.trim().slice(0,max+1) : '';
const str=(value,max,required=false) => {
  const s=text(value,max); if(s.length>max || (required && !s)) throw new Error('Vereist veld ontbreekt of bevat te veel tekens'); return s;
};
const date=value=>{const d=str(value,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(new Date(d+'T12:00:00Z').getTime())||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d) throw new Error('Ongeldige datum');return d;};
const time=value=>{const t=str(value,5,true);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('Ongeldig tijdstip');return t;};
const url=value=>{
  const s=str(value,800);if(!s)return '';
  try{const u=new URL(s);if(!['https:'].includes(u.protocol))throw new Error();return u.href;}
  catch{throw new Error('Gebruik een geldige https-link naar bewijsmateriaal')}
};
const reasons=value=>{if(!Array.isArray(value)||value.length<1||value.length>12||value.some(v=>!SANCTION_REASONS.includes(v))||new Set(value).size!==value.length)throw new Error('Selecteer minstens één geldige sanctiereden');return value};
export function validateEntry(raw){
  const type=raw?.type;
  if(!['observatie','sanctie'].includes(type))throw new Error('Onbekend registratietype');
  const common={type,details:str(raw.details,6000,true),eventDate:date(raw.eventDate),eventTime:time(raw.eventTime),otherPlayers:str(raw.otherPlayers,1000),evidenceUrl:url(raw.evidenceUrl)};
  if(type==='observatie')return {...common};
  const severity=Number(raw.severity);
  if(!Number.isInteger(severity)||severity<1||severity>10)throw new Error('Ernst moet tussen 1 en 10 liggen');
  const kind=str(raw.sanctionType,100,true);
  if(!SANCTION_TYPES.includes(kind)) throw new Error('Ongeldig sanctietype');
  return {...common,sanctionType:kind,explanation:str(raw.explanation,2000),reasons:reasons(raw.reasons),reasonOther:raw.reasons.includes('Anders')?str(raw.reasonOther,500,true):'',severity,cfxName:str(raw.cfxName,120),status:'actief'};
}
export function validateAmend(raw){
  if(raw?.status && !['actief','ingetrokken'].includes(raw.status)) throw new Error('Ongeldige status');
  const amendmentReason=str(raw?.amendmentReason,1000,true);
  const entry=validateEntry({...raw,type:'sanctie'});
  return {...entry,status:raw?.status||'actief',amendmentReason};
}
export function actorFromPersonnel(user,persons){
  if(!isDiscordId(user.discordId)) return null;
  const matches=persons.filter(p=>p.personId===user.discordId && user.departments.includes(p.dept));
  if(matches.length<1) return null;
  const x=matches.find(p=>p.dept==='politie')||matches[0];
  return {discordId:user.discordId,name:x.name,call:x.call,rank:x.rank,dept:x.dept};
}
export function safeSubject(subjects,dept,discordId){
  if(!isDiscordId(discordId))return null;
  return subjects.find(p=>p.dept===dept && p.personId===discordId)||null;
}
