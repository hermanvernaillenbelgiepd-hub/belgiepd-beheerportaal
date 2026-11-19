import {canEditPersonnel,validPersonnelKey} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {verifiedBoardCorpsDossierAdmin} from './board-corps-dossier-policy.js';
import {SPECIALTY_LABELS} from './normalize.js';

export const PERSONNEL_SPECIALIZATIONS_COLLECTION='bpd_personnel_specializations';
export const SPECIALTY_STATES=Object.freeze(["Nee","Stage","Ja","Docent","Niet ingevuld","AANGEMELD","RESTRICTED","ONTSLAG","INSTRUCTEUR","PLAVA","GPC","INACTIEF","MUG-HELI","SPECIALISATIE","LEIDING","OPLEIDING!","GESCHORST","BLACKLISTED"]);
const ACCEPTED=new Set(SPECIALTY_STATES);
// Qualifications without a dedicated Google Sheets column are native portal records.
export const PORTAL_POLICE_SPECIALTIES=Object.freeze([
 'Burgermeldingen','Terreinondersteuner','INTERVENTIEDIENST',
 'Prioritair rijden','EHBO'
]);
export const PORTAL_DEPANNAGE_SPECIALTIES=Object.freeze(['F.A.S.T','LSRA']);
export const allSpecialtyLabels=(dept,additional=[])=>[...new Set([
 ...(SPECIALTY_LABELS[dept]||[]),
 ...(dept==='politie'?PORTAL_POLICE_SPECIALTIES:[]),
 ...(dept==='depannage'?PORTAL_DEPANNAGE_SPECIALTIES:[]),
 ...additional
])];
// The callsign is checked on the police record, never inferred from Discord roles.
// Manual restrictions (e.g. radio misuse or loss of qualification) override defaults.
export function automaticPoliceSpecialties(subject){
 if(subject?.dept!=='politie')return {};
 const match=String(subject.call||'').trim().match(/(?:^|[-\s])([0-9]{3})$/);
 const call=match?Number(match[1]):null;
 if(call===null||call<200||call>999)return {};
 return {
  'Burgermeldingen':'Ja','Radio BM':'Ja','SIV/WPR':'Ja',
  'INTERVENTIEDIENST':'Ja',
  ...(call>=300?{'Signalisatie':'Ja'}:{}),
  ...(call>=400?{'Semi-ano.':'Ja'}:{})
 };
}
export function specialtyReadEnabled(env){return env.BPD_ENABLE_PERSONNEL_SPECIALTIES==='true'}
export function specialtyWritesEnabled(env){
  return specialtyReadEnabled(env)&&env.BPD_ENABLE_PERSONNEL_SPECIALTY_WRITES==='true';
}
export function allowedSpecialty(dept,label,additional=[]){
  // LRD is managed by the actual Discord bot role, never by manual status edits.
  if(dept==='politie'&&label==='LRD (Recherche)')return false;
  return typeof label==='string'&&
  (allSpecialtyLabels(dept,additional).includes(label));
}
export function canChangeSpecialty(actor,subject){
  if(verifiedBoardCorpsDossierAdmin(actor)&&subject&&
     actor.discordId!==subject.personId&&
     actor.dossierNativeDepartments?.includes(subject.dept))
    return canEditPersonnel(actor,subject);
  if(actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true&&
     actor?.uid==='discord:'+actor?.discordId&&
     actor?.discordId!==subject?.personId)
    return canEditPersonnel(actor,subject);
  // More restrictive than general personnel editing:
  // exactly officers and corps leadership in POLICE, never technical beheerder,
  // middle cadre, other services or the staff member themself.
  // ZONE may alter fire specializations across the verified fire service.
  // Neither fire leadership nor middle cadre can do this.
  if(subject?.dept==='brandweer')return Boolean(
    actor?.fireZoneChief===true&&actor?.departments?.includes('brandweer')&&
    actor?.dossierAllowedDepartments?.includes('brandweer')&&
    actor?.dossierNativeDepartments?.includes('brandweer')&&
    actor?.discordId!==subject.personId);
  // Verified local management for medical and towing services.
  // A Police officer role alone never grants a different department's edits.
  if(['ambulance','depannage'].includes(subject?.dept)){
    const dept=subject.dept;
    const confirmed=dept==='ambulance'?
      actor?.reportServiceRoles?.ambulanceAzls===true:
      actor?.reportServiceRoles?.depannageAwv===true;
    const scopedLeadership=['officierenkader','korpsleiding'].includes(actor?.role)&&
      ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,dept))&&
      canEditPersonnel(actor,subject);
    return Boolean(actor?.uid==='discord:'+actor?.discordId&&
      actor?.departments?.includes(dept)&&
      actor?.dossierNativeDepartments?.includes(dept)&&
      actor?.dossierAllowedDepartments?.includes(dept)&&
      actor?.discordId!==subject.personId&&(confirmed||scopedLeadership));
  }
  if(subject?.dept!=='politie')return false;
  if(!['officierenkader','korpsleiding'].includes(actor?.role))return false;
  if(!['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie')))return false;
  return canEditPersonnel(actor,subject);
}
export function validateSpecialtyChange(body,dept,additional=[]){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['label','value','reason','expectedRevision'].includes(k)))
    throw Error('Ongeldige specialisatiewijziging');
  if(!allowedSpecialty(dept,body.label,additional))throw Error('Onbekende specialisatie voor deze hulpdienst');
  if(!ACCEPTED.has(body.value))throw Error('Kies een toegestane specialisatiestatus');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<15||reason.length>500||/[\x00-\x1f\x7f<>]/.test(reason))
    throw Error('Motivering vereist (15–500 tekens)');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Vernieuw eerst de specialisatiegegevens');
  return {label:body.label,value:body.value,reason,expectedRevision:body.expectedRevision};
}
export function publicSpecializations(subject,document,additional=[]){
  const source=Array.isArray(subject?.specialties)?subject.specialties:[];
  const canonical=Object.fromEntries(source
    .filter(x=>allowedSpecialty(subject.dept,x?.label,additional))
    .map(x=>[x.label,typeof x.value==='string'?x.value.slice(0,90):'Niet ingevuld']));
  const values=document?.values&&typeof document.values==='object'&&!Array.isArray(document.values)
    ?document.values:{};
  // The Fire source columns were historically labelled "RED team" and
  // "Basis TR". Old portal versions also persisted those same qualifications
  // under aliases RED-TEAM / Basistraining. Preserve existing manual values
  // under their legacy keys instead of duplicating rows or losing updates.
  const fireLegacyAliases=subject.dept==='brandweer'?{
    'RED team':'RED-TEAM','Basis TR':'Basistraining'
  }:{};
  const savedManual=entry=>!!entry&&typeof entry==='object'&&
    ACCEPTED.has(entry.value)&&entry.source==='manual';
  const savedTraining=entry=>!!entry&&typeof entry==='object'&&
    ['Stage','Ja'].includes(entry.value)&&entry.source==='training'&&
    typeof entry.trainingRecordId==='string';
  const labels=allSpecialtyLabels(subject.dept,additional);
  const automatic=automaticPoliceSpecialties(subject);
  const items=labels.map(label=>{
    const saved=values[label];
    const legacy=values[fireLegacyAliases[label]];
    // Canonical manual edits always take precedence. A legacy explicit
    // value is kept unless it is only an empty placeholder.
    const actual=savedManual(saved)?saved:
      savedManual(legacy)&&legacy.value!=='Niet ingevuld'?legacy:
      savedTraining(saved)?saved:null;
    const derived=!actual&&automatic[label];
    return {label,value:actual?actual.value:(derived||canonical[label]||'Niet ingevuld'),
      source:actual?actual.source:derived?'automatic-call':'google-sheets'};
  });
  return {items,revision:Number.isSafeInteger(document?.revision)&&document.revision>=0
    ?document.revision:0};
}
// Use verified, fresh role data only for dossier presentation. An explicitly
// managed restriction or qualification remains authoritative over Discord.
// This neither persists values nor grants operational or portal access.
export function applyVerifiedSpecialtyRoleDisplay(state,roleIds,links){
 if(!state||!Array.isArray(state.items)||!Array.isArray(roleIds)||!Array.isArray(links))
  return state;
 const valid=new Set(roleIds.filter(x=>/^\d{15,22}$/.test(String(x))));
 const priority={Stage:1,AANGEMELD:1,Ja:2,INSTRUCTEUR:3,LEIDING:4};
 const best=new Map();
 for(const link of links){
  if(!valid.has(link?.roleId)||!Object.hasOwn(priority,link.value))continue;
  const prev=best.get(link.label);
  if(!prev||priority[link.value]>priority[prev.value])best.set(link.label,link);
 }
 for(const item of state.items){
  const match=best.get(item.label);
  if(!match||['manual','training'].includes(item.source))continue;
  item.value=match.value;
  item.source='discord-verified';
  item.level=String(match.level||'').slice(0,45);
  item.roleId=match.roleId;
 }
 return state;
}
export function applySpecialtyOverlays(records,docs,configs={}){
  const byKey=new Map();
  for(const entry of docs||[]){
    const doc=entry?.data?entry.data():entry;
    if(!doc||!validPersonnelKey(doc.dept,doc.discordId)||
      byKey.has(doc.dept+'_'+doc.discordId))continue;
    byKey.set(doc.dept+'_'+doc.discordId,doc);
  }
  return (records||[]).map(person=>{
    const extra=(configs?.[person.dept]?.customSpecialties||[]).map(x=>x.label);
    const mapped=publicSpecializations(person,byKey.get(person.dept+'_'+person.personId),extra);
    const legacy=mapped.items.filter(i=>!['Nee','Neen','Niet ingevuld','Niet gecontroleerd','n.v.t.','NVT',''].includes(i.value))
      .map(i=>i.label+': '+i.value).join(' · ');
    return {...person,specialties:mapped.items,
      special:legacy||'Geen geregistreerde specialisaties'};
  });
}

// Safe initial qualifications for a newly registered police officer.
// This does not grant Discord roles, operational rank or module access.
// Never apply to an unverified / unsynchronized callsign request.
export const INITIAL_POLICE_SPECIALTIES=Object.freeze(['Radio BM','SIV/WPR','Burgermeldingen','INTERVENTIEDIENST']);
export function initialFixedCallSpecialties(assignment){
  const call=Number(assignment?.assignedCall);
  if(assignment?.status!=='approved'||!Number.isSafeInteger(call)||
    call<200||call>299||!/^\d{15,22}$/.test(String(assignment.discordId||''))||
    Number(assignment.sync?.call)!==call||
    String(assignment.sync?.discordId||'')!==String(assignment.discordId))
    return null;
  return Object.fromEntries(INITIAL_POLICE_SPECIALTIES.map(label=>
    [label,{value:'Ja',source:'manual'}]));
}
