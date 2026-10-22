import {canEditPersonnel,canChangePersonnelStatus,validPersonnelKey} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {SPECIALTY_LABELS} from './normalize.js';

export const PERSONNEL_SPECIALIZATIONS_COLLECTION='bpd_personnel_specializations';
export const SPECIALTY_STATES=Object.freeze(['Nee','Stage','Ja','Docent','Te volgen','Niet ingevuld']);
const ACCEPTED=new Set(SPECIALTY_STATES);
export function specialtyReadEnabled(env){return env.BPD_ENABLE_PERSONNEL_SPECIALTIES==='true'}
export function specialtyWritesEnabled(env){
  return specialtyReadEnabled(env)&&env.BPD_ENABLE_PERSONNEL_SPECIALTY_WRITES==='true';
}
export function allowedSpecialty(dept,label){
  return typeof label==='string'&&SPECIALTY_LABELS[dept]?.includes(label)===true;
}
export function canChangeSpecialty(actor,subject){
  // More restrictive than general personnel editing:
  // exactly officers and corps leadership in POLICE, never technical beheerder,
  // middle cadre, other services or the staff member themself.
  if(subject?.dept!=='politie')return false;
  if(actor?.role==='middenkader')return canChangePersonnelStatus(actor,subject);
  if(!['officierenkader','korpsleiding'].includes(actor?.role))return false;
  if(!['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie')))return false;
  return canEditPersonnel(actor,subject);
}
export function validateSpecialtyChange(body,dept){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['label','value','reason','expectedRevision'].includes(k)))
    throw Error('Ongeldige specialisatiewijziging');
  if(!allowedSpecialty(dept,body.label))throw Error('Onbekende specialisatie voor deze hulpdienst');
  if(!ACCEPTED.has(body.value))throw Error('Ongeldige specialisatiestatus');
  if(body.value==='Te volgen'&&body.label!=='Radio BM')
    throw Error('Te volgen is uitsluitend beschikbaar voor RADIO BM');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<15||reason.length>500||/[\x00-\x1f\x7f<>]/.test(reason))
    throw Error('Motivering vereist (15–500 tekens)');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Vernieuw eerst de specialisatiegegevens');
  return {label:body.label,value:body.value,reason,expectedRevision:body.expectedRevision};
}
export function canSetSpecialtyValue(actor,subject,label,value){
  if(!canChangeSpecialty(actor,subject))return false;
  if(value==='Te volgen'&&label!=='Radio BM')return false;
  if(actor?.role==='middenkader')
    return label==='Radio BM'&&value==='Te volgen';
  return true;
}
export function validateSpecialtyBatch(body,dept){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['changes','reason','expectedRevision'].includes(k)))
    throw Error('Ongeldige reeks specialisatiewijzigingen');
  if(!Array.isArray(body.changes)||body.changes.length<1||body.changes.length>12)
    throw Error('Kies 1 tot en met 12 specialisaties');
  const keys=new Set(),changes=[];
  for(const item of body.changes){
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).some(k=>!['label','value'].includes(k)))
      throw Error('Ongeldige specialisatieregel');
    const validated=validateSpecialtyChange({...item,reason:body.reason,
      expectedRevision:body.expectedRevision},dept);
    if(keys.has(validated.label))throw Error('Dubbele specialisatie in één aanvraag');
    keys.add(validated.label);
    changes.push({label:validated.label,value:validated.value});
  }
  return {changes,reason:body.reason.trim(),expectedRevision:body.expectedRevision};
}
export const INITIAL_POLICE_SPECIALTIES=Object.freeze(['Radio BM','SIV/WPR']);
export function initialFixedCallSpecialties(assignment){
  const call=Number(assignment?.assignedCall);
  if(assignment?.status!=='approved'||!Number.isSafeInteger(call)||call<200||call>299||
    !/^\d{15,22}$/.test(String(assignment.discordId||''))||
    assignment.sync?.call!==call||
    String(assignment.sync?.discordId||'')!==String(assignment.discordId))
    return null;
  return Object.fromEntries(INITIAL_POLICE_SPECIALTIES.map(label=>[label,{value:'Ja',source:'manual'}]));
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
    const legacy=mapped.items.filter(i=>!['Nee','Neen','Te volgen','Niet ingevuld','n.v.t.','NVT',''].includes(i.value))
      .map(i=>i.label+': '+i.value).join(' · ');
    return {...person,specialties:mapped.items,
      special:legacy||'Geen geregistreerde specialisaties'};
  });
}
