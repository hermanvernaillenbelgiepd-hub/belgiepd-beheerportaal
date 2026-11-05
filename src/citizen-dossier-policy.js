import {roleForDepartment} from './leave-policy.js';

// Burgerpersoneelsdossiers: afzonderlijke dienstscope, nooit gekoppeld aan
// de vroegere (uitgeschakelde) burger-sollicitatiedossiers.
export const CITIZEN_DOSSIER_COLLECTION='bpd_citizen_staff_dossiers';
export const CITIZEN_ROLES=Object.freeze({
  bio:'1398985105254650007',
  burger:'1309532438019706966',
  burgerraad:'1492485336197234728'
});
export const CITIZEN_ENTRY_KINDS=Object.freeze([
  'notitie','observatie','sanctie_mondeling','sanctie_schriftelijk','volwaardig'
]);
const ID=/^\d{15,22}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export const validCitizenId=value=>typeof value==='string'&&ID.test(value);

function roleSnapshot(member,guildId,now,maxAgeMs){
  if(!validCitizenId(guildId)||!member||member.guildId!==guildId||
    !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
    now-member.verifiedAt>maxAgeMs||!Array.isArray(member.roleIds)||
    !member.roleIds.every(validCitizenId))return null;
  return new Set(member.roleIds);
}

// Alleen een actuele, aan de guild en de aangemelde Discord-identiteit
// gekoppelde rol mag operationele rechten geven. Een label is geen bewijs.
export function verifiedCitizenCouncil(actor,member,guildId,now=Date.now()){
  if(!validCitizenId(actor?.discordId)||
    actor.uid!=='discord:'+actor.discordId)return false;
  return Boolean(roleSnapshot(member,guildId,now,15*60*1000)?.has(CITIZEN_ROLES.burgerraad));
}
// Technisch beheer krijgt alleen toegang via de afzonderlijke, getekende
// en door de server gecontroleerde technische profielmodus.
function verifiedCitizenTechnical(actor){
  return actor?.portalTechnicalMode===true&&
    actor?.profileTechnicalAvailable===true&&
    validCitizenId(actor.discordId)&&actor.uid==='discord:'+actor.discordId;
}

// Korpsleiding mag burgerdossiers openen na goedgekeurde Politie-dienstscope
// EN een server-geverifieerde Discord-Korpsleidingrol of geauditeerde uitzondering.
// Een willekeurig korpsleidinglabel, 9xx-callsign of bestuurslabel volstaat niet.
export function verifiedCitizenCorpsReader(actor){
  return Boolean(validCitizenId(actor?.discordId)&&
    actor.uid==='discord:'+actor.discordId&&
    actor.role==='korpsleiding'&&actor.departments?.includes('politie')&&
    roleForDepartment(actor,'politie')==='korpsleiding'&&
    (actor.discordPoliceRank==='korpsleiding'||actor.manualCorpsApproved===true));
}
export function canAccessCitizenDossier(actor,councilVerified){
  return councilVerified===true||verifiedCitizenCorpsReader(actor)||
    verifiedCitizenTechnical(actor);
}
// Burgerraad en Korpsleiding mogen registreren; technisch beheer behoudt
// dezelfde bevoegdheid in de afzonderlijk geverifieerde technische modus.
export function canWriteCitizenDossier(actor,councilVerified,subjectId){
  return canAccessCitizenDossier(actor,councilVerified)&&
    validCitizenId(subjectId)&&subjectId!==actor?.discordId;
}

// Verwijderen is een uitzonderlijke, geauditeerde bevoegdheid. Alleen
// server-geverifieerde Korpsleiding of technisch beheer; Burgerraad nooit
// uitsluitend op grond van de Burgerraadrol. Eigen dossiers blijven beschermd.
export function canManageCitizenDeletions(actor){
  return verifiedCitizenCorpsReader(actor)||verifiedCitizenTechnical(actor);
}
export function canDeleteCitizenEntry(actor,subjectId){
  return canManageCitizenDeletions(actor)&&
    validCitizenId(subjectId)&&subjectId!==actor?.discordId;
}
export function validateCitizenDeletion(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).length!==1||!Object.hasOwn(raw,'reason'))
    throw Error('Een gemotiveerd verwijderverzoek is vereist');
  if(typeof raw.reason!=='string'||raw.reason.trim().length<10||
    raw.reason.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw.reason))
    throw Error('Vul een verwijderreden van 10 tot 500 tekens in');
  return {reason:raw.reason.trim()};
}

// Enkel als we recent onafhankelijk de rol zagen, tonen we een roltype.
// De volledige Burger-rol wint van de oude BIO-rol bij promotie.
export function citizenMemberType(member,guildId,now=Date.now()){
  const roles=roleSnapshot(member,guildId,now,30*24*60*60*1000);
  if(!roles)return null;
  if(roles.has(CITIZEN_ROLES.burgerraad))return 'Burgerraad';
  if(roles.has(CITIZEN_ROLES.burger))return 'Burger';
  if(roles.has(CITIZEN_ROLES.bio))return 'BIO';
  return null;
}
export function citizenSubject(personnel,discordId){
  if(!validCitizenId(discordId)||!Array.isArray(personnel))return null;
  const matches=personnel.filter(p=>p?.dept==='burger'&&p.personId===discordId);
  return matches.length===1?matches[0]:null;
}
function validDate(value){
  if(typeof value!=='string'||!DATE.test(value))return false;
  const d=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value&&
    d.getUTCFullYear()>=2000&&d.getUTCFullYear()<=2100;
}
export function validateCitizenEntry(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).some(k=>!['kind','eventDate','details','score'].includes(k)))
    throw Error('Ongeldige burgerregistratie');
  if(!CITIZEN_ENTRY_KINDS.includes(raw.kind))throw Error('Ongeldig registratietype');
  if(!validDate(raw.eventDate))throw Error('Ongeldige datum');
  if(typeof raw.details!=='string'||raw.details.trim().length<3||
     raw.details.length>1600||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw.details))
    throw Error('Vul een geldige toelichting van 3 tot 1600 tekens in');
  if(raw.kind==='observatie'){
    if(!Number.isInteger(raw.score)||raw.score<0||raw.score>10)
      throw Error('Een observatie vereist een score van 0 tot 10');
  }else if(raw.score!==undefined)
    throw Error('Een score hoort uitsluitend bij een observatie');
  return {kind:raw.kind,eventDate:raw.eventDate,
    details:raw.details.trim(),...(raw.kind==='observatie'?{score:raw.score}:{})};
}
export function observationAverage(entries){
  const scores=(Array.isArray(entries)?entries:[])
    .filter(x=>x?.kind==='observatie'&&Number.isInteger(x.score)&&x.score>=0&&x.score<=10)
    .map(x=>x.score);
  return scores.length?
    {count:scores.length,average:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10}:
    {count:0,average:null};
}
