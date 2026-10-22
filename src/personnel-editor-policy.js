import {createHash} from 'node:crypto';
import {roleForDepartment} from './leave-policy.js';
import {policeKader} from './normalize.js';

// Persistent overlays never contain identity, rank or permissions.
// They can be merged with source Sheets only after a controlled rollout.
export const PERSONNEL_EDITS_COLLECTION='bpd_personnel_edits';
export const EDITABLE_STATUSES=Object.freeze(['Actief','Inactief','50/50','Verlof','In opleiding','Afwezig']);
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
export function canViewPersonnel(actor,dept){
  if(!SERVICES.has(dept)||!actor?.departments?.includes(dept))return false;
  const scoped=roleForDepartment(actor,dept);
  return ['middenkader','officierenkader','korpsleiding'].includes(scoped)||
    (actor.role==='beheerder'&&scoped==='beheerder');
}
export function canEditPersonnel(actor,person){
  if(!person||!validPersonnelKey(person.dept,person.personId)||!canViewPersonnel(actor,person.dept)||
     (Array.isArray(actor?.dossierNativeDepartments)&&!actor.dossierNativeDepartments.includes(person.dept))||
     actor.discordId===person.personId)return false;
  const scoped=roleForDepartment(actor,person.dept);
  if(person.dept==='brandweer'&&actor.fireZoneChief===true)return true;
  if(actor.portalTechnicalMode===true||actor.role==='beheerder'&&scoped==='beheerder')return true;
  if(!['officierenkader','korpsleiding'].includes(scoped) ||
     !['officierenkader','korpsleiding'].includes(actor.role))return false;
  if(actor.role==='officierenkader'&&scoped==='korpsleiding')return false;
  if(person.dept==='politie'){
    const target=policeKader(person.rank);
    if(target==='Korpsleiding'||target==='Kader')return false;
    if(target==='Officierenkader'&&scoped!=='korpsleiding')return false;
  }
  return true;
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
    if(typeof e.name!=='string'||typeof e.call!=='string'||!EDITABLE_STATUSES.includes(e.status))continue;
    const key=e.dept+'_'+e.discordId;
    if(byKey.has(key))continue;
    byKey.set(key,e);
  }
  return records.map(p=>{
    const e=byKey.get(p.dept+'_'+p.personId);
    // Never modify the immutable identity, rank or specialization metadata.
    return e?{...p,name:e.name,call:e.call,status:e.status,source:'firestore-overlay'}:p;
  });
}
