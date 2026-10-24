import {canEditPersonnel,validPersonnelKey} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {SPECIALTY_LABELS} from './normalize.js';

export const PERSONNEL_SPECIALIZATIONS_COLLECTION='bpd_personnel_specializations';
export const SPECIALTY_STATES=Object.freeze(["Nee","Stage","Ja","Docent","Niet ingevuld","AANGEMELD","RESTRICTED","ONTSLAG","INSTRUCTEUR","PLAVA","GPC","INACTIEF","MUG-HELI","SPECIALISATIE","LEIDING","OPLEIDING!","GESCHORST","BLACKLISTED"]);
const ACCEPTED=new Set(SPECIALTY_STATES);
export function specialtyReadEnabled(env){return env.BPD_ENABLE_PERSONNEL_SPECIALTIES==='true'}
export function specialtyWritesEnabled(env){
  return specialtyReadEnabled(env)&&env.BPD_ENABLE_PERSONNEL_SPECIALTY_WRITES==='true';
}
export function allowedSpecialty(dept,label){
  return typeof label==='string'&&SPECIALTY_LABELS[dept]?.includes(label)===true;
}
export function canChangeSpecialty(actor,subject){
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
  if(subject?.dept!=='politie')return false;
  if(!['officierenkader','korpsleiding'].includes(actor?.role))return false;
  if(!['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie')))return false;
  return canEditPersonnel(actor,subject);
}
export function validateSpecialtyChange(body,dept){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['label','value','reason','expectedRevision'].includes(k)))
    throw Error('Ongeldige specialisatiewijziging');
  if(!allowedSpecialty(dept,body.label))throw Error('Onbekende specialisatie voor deze hulpdienst');
  if(!ACCEPTED.has(body.value))throw Error('Kies een toegestane specialisatiestatus');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<15||reason.length>500||/[\x00-\x1f\x7f<>]/.test(reason))
    throw Error('Motivering vereist (15–500 tekens)');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Vernieuw eerst de specialisatiegegevens');
  return {label:body.label,value:body.value,reason,expectedRevision:body.expectedRevision};
}
export function publicSpecializations(subject,document){
  const source=Array.isArray(subject?.specialties)?subject.specialties:[];
  const canonical=Object.fromEntries(source
    .filter(x=>allowedSpecialty(subject.dept,x?.label))
    .map(x=>[x.label,typeof x.value==='string'?x.value.slice(0,90):'Niet ingevuld']));
  const values=document?.values&&typeof document.values==='object'&&!Array.isArray(document.values)
    ?document.values:{};
  const items=(SPECIALTY_LABELS[subject.dept]||[]).map(label=>{
    const saved=values[label];
    const valid=!!saved&&typeof saved==='object'&&ACCEPTED.has(saved.value)&&
      saved.source==='manual';
    return {label,value:valid?saved.value:(canonical[label]||'Niet ingevuld'),
      source:valid?'manual':'google-sheets'};
  });
  return {items,revision:Number.isSafeInteger(document?.revision)&&document.revision>=0
    ?document.revision:0};
}
export function applySpecialtyOverlays(records,docs){
  const byKey=new Map();
  for(const entry of docs||[]){
    const doc=entry?.data?entry.data():entry;
    if(!doc||!validPersonnelKey(doc.dept,doc.discordId)||
      byKey.has(doc.dept+'_'+doc.discordId))continue;
    byKey.set(doc.dept+'_'+doc.discordId,doc);
  }
  return (records||[]).map(person=>{
    const mapped=publicSpecializations(person,byKey.get(person.dept+'_'+person.personId));
    const legacy=mapped.items.filter(i=>!['Nee','Neen','Niet ingevuld','n.v.t.','NVT',''].includes(i.value))
      .map(i=>i.label+': '+i.value).join(' · ');
    return {...person,specialties:mapped.items,
      special:legacy||'Geen geregistreerde specialisaties'};
  });
}

// Safe initial qualifications for a newly registered police officer.
// This does not grant Discord roles, operational rank or module access.
// Never apply to an unverified / unsynchronized callsign request.
export const INITIAL_POLICE_SPECIALTIES=Object.freeze(['Radio BM','SIV/WPR']);
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
