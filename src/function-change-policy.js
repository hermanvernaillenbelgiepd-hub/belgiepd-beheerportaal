import {ROLE_CATALOG} from './role-catalog.js';
import {roleForDepartment} from './leave-policy.js';
import {canEditPersonnel} from './personnel-editor-policy.js';
import {verifiedBoardCorpsDossierAdmin} from './board-corps-dossier-policy.js';

// Alleen operationele specialisaties zijn dossierfuncties. Reeks-, kader-,
// bestuurs- en toegangsmachtigingen kunnen hiermee NOOIT worden gewijzigd.
export const FUNCTION_DEPARTMENTS=Object.freeze(['politie','brandweer']);
export const FUNCTION_ROLES=Object.freeze(ROLE_CATALOG.filter(role=>
  FUNCTION_DEPARTMENTS.includes(role.dept)&&role.kind==='specialisatie')
  .map(({id,name,dept,stage})=>Object.freeze({id,name,dept,stage})));
const ID=/^\d{15,22}$/;
const byId=new Map(FUNCTION_ROLES.map(role=>[role.id,role]));
export const functionRole=id=>byId.get(id)||null;
export const functionalRoles=dept=>FUNCTION_ROLES.filter(role=>role.dept===dept);
export function verifiedFunctionalRoleIds(member,dept,guildId,now=Date.now()){
  if(!member||member.guildId!==guildId||!ID.test(String(guildId||''))||
    !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
    now-member.verifiedAt>15*60*1000||!Array.isArray(member.roleIds)||
    !member.roleIds.every(id=>ID.test(String(id))))return null;
  return [...new Set(member.roleIds)].filter(id=>functionRole(id)?.dept===dept);
}
export function canRecordFunctionChange(actor,subject){
  if(verifiedBoardCorpsDossierAdmin(actor)&&
     FUNCTION_DEPARTMENTS.includes(subject?.dept)&&
     actor?.dossierNativeDepartments?.includes(subject.dept)&&
     actor.discordId!==subject.personId)
    return canEditPersonnel(actor,subject);
  if(!FUNCTION_DEPARTMENTS.includes(subject?.dept)||!ID.test(String(subject?.personId||''))||
    !actor?.dossierNativeDepartments?.includes(subject.dept)||
    !actor?.departments?.includes(subject.dept)||
    actor?.discordId===subject.personId)return false;
  const scoped=roleForDepartment(actor,subject.dept);
  if(!['officierenkader','korpsleiding'].includes(scoped))return false;
  // Bij Brandweer is ZONE de officiële leiding. Geen overerving van
  // politie-officierenrollen zonder expliciete brandweerautorisatie.
  if(subject.dept==='brandweer'&&actor?.fireZoneChief===true)
    return canEditPersonnel(actor,subject);
  return ['officierenkader','korpsleiding'].includes(actor.role)&&
    canEditPersonnel(actor,subject);
}
export function validateFunctionChange(body,dept){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['action','previousRoleId','newRoleId','reason','expectedRevision'].includes(key)))
    throw Error('Ongeldige functiewijziging');
  const action=body.action;
  if(!['add','replace','remove'].includes(action))throw Error('Kies een functiewijziging');
  const from=body.previousRoleId||null,to=body.newRoleId||null;
  if(action==='add'&&(from||!to)||action==='remove'&&(!from||to)||
     action==='replace'&&(!from||!to||from===to))
    throw Error('Kies een geldige oude en nieuwe functie');
  if(from&&functionRole(from)?.dept!==dept||to&&functionRole(to)?.dept!==dept)
    throw Error('Deze functie behoort niet tot de toegelaten hulpdienst');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<15||reason.length>500||/[\x00-\x1f\x7f<>]/.test(reason))
    throw Error('Motivering van functiewijziging vereist (15–500 tekens)');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Vernieuw eerst de functies van dit personeelslid');
  return {action,previousRoleId:from,newRoleId:to,reason,expectedRevision:body.expectedRevision};
}
export function applyFunctionChange(current,change){
  const ids=[...new Set(current||[])];
  const prev=change.previousRoleId, next=change.newRoleId;
  if(prev&&!ids.includes(prev))throw Error('De vorige functie is niet meer actief. Vernieuw het dossier.');
  if(next&&ids.includes(next))throw Error('De nieuwe functie is al geregistreerd.');
  return [...ids.filter(id=>id!==prev),...(next?[next]:[])].sort();
}
export function describeFunctionChange(change){
  const from=change.previousRoleId?functionRole(change.previousRoleId)?.name:'Geen';
  const to=change.newRoleId?functionRole(change.newRoleId)?.name:'Geen';
  return {from,to,description:change.action==='replace'?
    'Functiewijziging: '+from+' → '+to:
    change.action==='add'?'Extra functie toegekend: '+to:'Functie beëindigd: '+from};
}
