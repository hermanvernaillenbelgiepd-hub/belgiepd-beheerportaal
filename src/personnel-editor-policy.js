import {createHash} from 'node:crypto';
import {roleForDepartment} from './leave-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {policeKader} from './normalize.js';
import {isPolice9xx} from './verified-police-cadre.js';
import {mayOpenFireSubject} from './fire-dossier-policy.js';
import {verifiedBoardCorpsDossierAdmin} from './board-corps-dossier-policy.js';

// Persistent overlays never contain identity, rank or permissions.
// They can be merged with source Sheets only after a controlled rollout.
export const PERSONNEL_EDITS_COLLECTION='bpd_personnel_edits';
export const EDITABLE_STATUSES=Object.freeze([
 'ACTIEF','50/50','NON-ACTIEF','INACTIEF','CHECKING','VERLOF',
 'ONTSLAG','GESCHORST','VERWIJDERD'
]);
// Previously saved labels still have to render; they are no longer offered
// for NEW manual status changes.
export const LEGACY_PERSONNEL_STATUSES=Object.freeze([
 'Actief','Inactief','Verlof','In opleiding','Afwezig'
]);
const ID=/^\d{15,22}$/;
const SERVICES=new Set(['politie','brandweer','ambulance','depannage']);
const TRIM=s=>typeof s==='string'?s.trim():'';
// Claim documents protect against concurrent duplicate callsign allocation.
export function personnelCallClaimId(dept,call){
  return createHash('sha256').update(dept+'|'+String(call||'').trim().toLocaleLowerCase('nl')).digest('hex');
}
export function validPersonnelKey(dept,id){
  return SERVICES.has(dept)&&ID.test(id);
}
// Korpsleiding-fiches zijn geen algemene kaderdossiers. De officiële rang
// bepaalt de afscherming; een 9xx-nummer op zichzelf is geen korpsbewijs.
export function isCorpsLeadershipPersonnel(person){
  return person?.dept==='politie'&&policeKader(person.rank)==='Korpsleiding';
}
function verifiedCorpsReader(actor){
  // Both an approved portal role AND a recent, matching Discord role are
  // required; a self-reported 9xx callsign or legacy Google account cannot
  // grant access to protected corps dossiers.
  return actor?.uid==='discord:'+actor?.discordId&&
    actor?.role==='korpsleiding'&&roleForDepartment(actor,'politie')==='korpsleiding'&&
    (actor?.discordPoliceRank==='korpsleiding'||actor?.manualCorpsApproved===true);
}
export function canReadPersonnelSubject(actor,person){
  if(!person||!canReadServiceDossier(actor,person.dept))return false;
  // Technical access is never inferred from ownership claims, callsigns or
  // a browser flag. The server only sets this mode after checking the configured
  // Discord allowlist and a signed short-lived technical session.
  if(actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true&&
     actor?.uid==='discord:'+actor?.discordId)return true;
  if(person.dept==='brandweer'){
    return mayOpenFireSubject(actor,person,
      actor.fireSubjectRoleSets?.get(person.personId)||null);
  }
  if(person.dept!=='politie')return true;
  if(actor?.boardPersonnelAdmin===true)return true;
  const scoped=roleForDepartment(actor,'politie');
  const officer=['officierenkader','korpsleiding'].includes(scoped)&&
    ['officierenkader','korpsleiding'].includes(actor?.role);
  const corps=verifiedCorpsReader(actor);
  const call=String(person.call||'').trim().match(/^(?:S[- ]?)?(\d{3})$/i);
  const number=call?Number(call[1]):null;
  // 900 Thijs en 910 Extra: enkel geverifieerde Korpsleiding (of Bestuur).
  if(number===900||number===910)return corps;
  // Andere 9xx: enkel Korpsleiding; uitzonderingen met een geverifieerde
  // officierenrol blijven leesbaar voor Korpsleiding, niet voor Middenkader.
  if(isPolice9xx(person.call))return corps;
  const cadre=policeKader(person.rank);
  if(cadre==='Korpsleiding')return corps;
  if(cadre==='Officierenkader')return corps;
  if(cadre==='Middenkader')return officer;
  if(cadre==='Kader')return false;
  return true;
}
export function canViewPersonnel(actor,dept){
  if(!SERVICES.has(dept))return false;
  if(actor?.boardPersonnelAdmin===true)return true;
  if(!actor?.departments?.includes(dept))return false;
  const scoped=roleForDepartment(actor,dept);
  return ['middenkader','officierenkader','korpsleiding'].includes(scoped)||
    (actor.role==='beheerder'&&scoped==='beheerder');
}
export function canEditPersonnel(actor,person){
  if(!person||!validPersonnelKey(person.dept,person.personId)||!canViewPersonnel(actor,person.dept)||
     actor.discordId===person.personId)return false;
  // Bestuur is uitsluitend een inzagerecht. Een afzonderlijk goedgekeurde
  // operationele dienstrol blijft geldig, ook bij een bestuursaanstelling.
  // Nooit schrijfrechten ontlenen aan Bestuur alleen.
  // Een expliciet berekende dienstscope mag geen andere dienst openen;
  // oudere correct goedgekeurde kaderaccounts zonder scopeveld behouden hun
  // dienstrol. Bestuur alléén geeft nooit operationele schrijfrechten.
  // Dual-verified Board+Police Corps may correct personnel files across
  // services, including protected 9xx subjects, but never their OWN file.
  // Does not grant portal-role edits or Discord-rank changes.
  if(verifiedBoardCorpsDossierAdmin(actor)&&
     actor?.dossierNativeDepartments?.includes(person.dept)&&
     canReadServiceDossier(actor,person.dept))return true;
  if(Array.isArray(actor?.dossierNativeDepartments)&&
     !actor.dossierNativeDepartments.includes(person.dept))return false;
  const scoped=roleForDepartment(actor,person.dept);
  if(person.dept==='brandweer'&&actor.fireZoneChief===true)return true;
  if(actor.portalTechnicalMode===true||actor.role==='beheerder'&&scoped==='beheerder')return true;
  // De goedgekeurde dienstrol bepaalt de bevoegdheid, niet het Bestuur-label
  // en niet uitsluitend de globale (mogelijk anders weergegeven) accountrol.
  if(!['officierenkader','korpsleiding'].includes(scoped)||
     !['officierenkader','korpsleiding'].includes(actor.role))return false;
  if(actor.role==='officierenkader'&&scoped==='korpsleiding')return false;
  if(person.dept==='politie'){
    const target=policeKader(person.rank);
    if(target==='Korpsleiding'||target==='Kader')return false;
    if(target==='Officierenkader'&&scoped!=='korpsleiding')return false;
  }
  return true;
}
// Uitsluitend voor de algemene fichegegevens (naam, roepnummer, status,
// aanstellingsdatum, eenheid en functie). Dit verleent geen rechten op
// promoties, specialisaties, sancties of andere personeelsacties.
export function canEditGeneralPersonnelInfo(actor,person){
  if(!person||!validPersonnelKey(person.dept,person.personId)||
     !canReadServiceDossier(actor,person.dept)||
     actor?.discordId===person.personId)return false;
  // ZONE is the Fire equivalent of operational Korpsleiding, provided that
  // the Fire role, allowed department and native staff scope are server-verified.
  // This does not grant ZONE any authority in Police, Ambulance or Depannage.
  if(person.dept==='brandweer'&&actor?.fireZoneChief===true&&
     actor?.departments?.includes('brandweer')&&
     actor?.dossierNativeDepartments?.includes('brandweer')&&
     actor?.dossierAllowedDepartments?.includes('brandweer'))return true;
  // boardPersonnelAdmin is uitsluitend afkomstig van server-geverifieerd Bestuur.
  if(actor?.boardPersonnelAdmin===true)return true;
  if(actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true&&
     actor?.uid==='discord:'+actor?.discordId)return canEditPersonnel(actor,person);
  // De eigen operationele kaderrol blijft dienstgebonden en onderworpen aan
  // bestaande doelrangbeperkingen; Middenkader of technische modus is op
  // zichzelf niet bevoegd om deze algemene gegevens te wijzigen.
  const cadre=roleForDepartment(actor,person.dept);
  return ['officierenkader','korpsleiding'].includes(actor?.role)&&
    ['officierenkader','korpsleiding'].includes(cadre)&&
    canEditPersonnel(actor,person);
}
// Status-only delegation for Middenkader. The rank itself must be a known
// lower rank; a callsign cannot masquerade as proof of rank.
export function canChangePersonnelStatus(actor,person){
  if(!person||!validPersonnelKey(person.dept,person.personId)||
     actor?.discordId===person.personId||!canViewPersonnel(actor,person.dept)||
     actor?.role!=='middenkader'||roleForDepartment(actor,person.dept)!=='middenkader'||
     !Array.isArray(actor.dossierNativeDepartments)||
     !actor.dossierNativeDepartments.includes(person.dept)||
     person.dept!=='politie')return false;
  return ['Agentenkader','Basiskader'].includes(policeKader(person.rank));
}
// Middenkader mag uitsluitend de naam van eigen lager politiekader corrigeren.
export function canRenameLowerPolice(actor,person){
  return Boolean(person?.dept==='politie'&&validPersonnelKey(person.dept,person.personId)&&
    actor?.uid==='discord:'+actor?.discordId&&
    actor?.discordId!==person.personId&&actor?.role==='middenkader'&&
    roleForDepartment(actor,'politie')==='middenkader'&&
    Array.isArray(actor?.dossierNativeDepartments)&&
    actor.dossierNativeDepartments.includes('politie')&&
    canReadPersonnelSubject(actor,person)&&
    ['Agentenkader','Basiskader'].includes(policeKader(person.rank)));
}
export function validateLowerPoliceRename(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(x=>!['name','reason','expectedRevision'].includes(x)))
    throw Error('Alleen naam, motivering en revisie zijn toegestaan');
  const name=checkedText(body.name,2,120,'Naam');
  const reason=checkedText(body.reason,15,500,'Motivering');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Vernieuw eerst de personeelsfiche');
  return {name,reason,expectedRevision:body.expectedRevision};
}
function checkedText(value,min,max,name){
  const text=TRIM(value);
  if(!text||text.length<min||text.length>max||/[\x00-\x1f\x7f<>]/.test(text))
    throw new Error(name+' is ongeldig');
  return text;
}
export function validatePersonnelChange(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Ongeldige personeelswijziging');
  const allowed=new Set(['name','call','status','reason','expectedRevision']);
  if(Object.keys(payload).some(k=>!allowed.has(k)))throw new Error('Alleen naam, roepnummer en status mogen worden gewijzigd');
  const name=checkedText(payload.name,2,120,'Naam');
  const call=checkedText(payload.call,1,24,'Roepnummer');
  if(!EDITABLE_STATUSES.includes(payload.status))throw new Error('Ongeldige personeelsstatus');
  const reason=checkedText(payload.reason,10,500,'Motivering');
  const expectedRevision=payload.expectedRevision;
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Ververs eerst de personeelsfiche');
  return {name,call,status:payload.status,reason,expectedRevision};
}
export function mergePersonnelEdits(records,editRecords){
  const byKey=new Map();
  for(const e of editRecords||[]){
    if(!e||!validPersonnelKey(e.dept,e.discordId))continue;
    if(!Number.isSafeInteger(e.revision)||e.revision<1)continue;
    // Preserve legitimate non-editable legacy statuses during an authorised
    // rank change; never replace them with a made-up administrative status.
    const inheritedStatus=e.approvedRankEdit===true&&typeof e.status==='string'&&
      e.status.length>0&&e.status.length<=100&&!/[<>\x00-\x1f\x7f]/.test(e.status);
    if(typeof e.name!=='string'||typeof e.call!=='string'||
       !EDITABLE_STATUSES.includes(e.status)&&
       !LEGACY_PERSONNEL_STATUSES.includes(e.status)&&!inheritedStatus)continue;
    const key=e.dept+'_'+e.discordId;
    if(byKey.has(key))continue;
    byKey.set(key,e);
  }
  return records.map(p=>{
    const e=byKey.get(p.dept+'_'+p.personId);
    // An explicit, audited server-side rank decision is the only exception
    // to the otherwise read-only Google Sheets grade. This does not grant roles.
    if(!e)return p;
    const officialRank=e.approvedRankEdit===true&&typeof e.rank==='string'?e.rank:p.rank;
    return {...p,name:e.name,call:e.call,status:e.status,rank:officialRank,
      ...(p.dept==='politie'?{kader:policeKader(officialRank,e.call)}:{}),
      source:'firestore-overlay'};
  });
}

// Resolve the auditor's current, not historical, name and callsign.
// Use only personnel from services the requesting reader may access.
export function currentPersonnelAuditActor(actorId,eventDept,records,allowedDepartments){
  if(!ID.test(String(actorId||''))||!SERVICES.has(eventDept)||
    !Array.isArray(records)||!Array.isArray(allowedDepartments)||
    !allowedDepartments.includes(eventDept))return null;
  const candidates=records.filter(p=>p&&p.personId===actorId&&
    SERVICES.has(p.dept)&&allowedDepartments.includes(p.dept));
  const sameService=candidates.filter(p=>p.dept===eventDept);
  const matches=sameService.length?sameService:candidates;
  // Ambiguous cross-service records must not be guessed.
  if(matches.length!==1)return null;
  const person=matches[0];
  const name=TRIM(person.name),call=TRIM(person.call),rank=TRIM(person.rank);
  if(!name||!call||!rank)return null;
  return {name:name.slice(0,120),call:call.slice(0,24),
    rank:rank.slice(0,90),department:person.dept};
}
