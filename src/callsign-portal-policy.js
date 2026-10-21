// Firestore-only police intake. Sheets is a read-only legacy collision source.
import {roleForDepartment} from './leave-policy.js';
import {personnelCallClaimId} from './personnel-editor-policy.js';
export const MIN_FIXED_CALL=200;
export const MAX_FIXED_CALL=299;
export const POLICE_RANK='Agent';
export const POLICE_STATUS='In opleiding';
const ID=/^\d{15,22}$/;
const s=v=>String(v??'').trim();
export function fixedCall(value,{optional=false}={}){
  if(optional&&(value===null||value===undefined||value===''))return null;
  const raw=s(value);
  if(!/^(?:2\d\d)$/.test(raw)||Number(raw)<MIN_FIXED_CALL||Number(raw)>MAX_FIXED_CALL)
    throw Error('Kies een vast roepnummer tussen 200 en 299');
  return Number(raw);
}
export function applicantRequest(data,discordId){
  if(!ID.test(s(discordId)))throw Error('Geverifieerde Discord-identiteit vereist');
  const name=s(data?.name);
  const temp=s(data?.temporaryCall);
  if(name.length<2||name.length>80||/[\x00-\x1f<>]/.test(name)||/^[=+@-]/.test(name))
    throw Error('Ongeldige naam');
  if(!/^\d{3}$/.test(temp)||Number(temp)<110||Number(temp)>195)
    throw Error('Tijdelijk roepnummer moet tussen 110 en 195 liggen');
  return {discordId,name,temporaryCall:temp,preferredCall:fixedCall(data?.preferredCall,{optional:true})};
}
export function canInspect(actor){
  if(!actor?.departments?.includes('politie'))return false;
  const scoped=roleForDepartment(actor,'politie');
  return ['middenkader','officierenkader','korpsleiding'].includes(actor.role)&&
    ['middenkader','officierenkader','korpsleiding'].includes(scoped)||
    actor.role==='beheerder'&&scoped==='beheerder';
}
export function canAssign(actor){
  if(!canInspect(actor))return false;
  const scoped=roleForDepartment(actor,'politie');
  return ['officierenkader','korpsleiding'].includes(actor.role)&&
    ['officierenkader','korpsleiding'].includes(scoped)||
    actor.role==='beheerder'&&scoped==='beheerder';
}
export function claimedCalls(roster,claimDocs,legacyDocs){
  const used=new Set();
  for(const p of roster||[]){
    if(p.dept!=='politie')continue;
    const call=s(p.call);
    if(/^2\d\d$/.test(call))used.add(Number(call));
  }
  for(const d of claimDocs||[]){
    const c=s(d.call);
    if(/^2\d\d$/.test(c))used.add(Number(c));
  }
  for(const d of legacyDocs||[]){
    const c=s(d.call??d.id);
    if(/^2\d\d$/.test(c))used.add(Number(c));
  }
  return used;
}
export function availableCalls(used){
  return Array.from({length:MAX_FIXED_CALL-MIN_FIXED_CALL+1},(_,i)=>i+MIN_FIXED_CALL)
    .filter(n=>!used.has(n));
}
export function proposedCall(available,preferred){
  const selected=fixedCall(preferred,{optional:true});
  if(selected!==null&&!available.includes(selected))throw Error('Dit roepnummer is niet meer vrij');
  const number=selected??available[0];
  if(!number)throw Error('Er is geen vrij roepnummer tussen 200 en 299');
  return number;
}
export function claimId(call){return personnelCallClaimId('politie',fixedCall(call))}
export function existingApplicant(roster,discordId,name){
  const norm=s(name).toLocaleLowerCase('nl');
  return (roster||[]).some(p=>p.dept==='politie'&&(
    p.personId===discordId || s(p.name).toLocaleLowerCase('nl')===norm));
}
// This branch is a TEST pilot: forbid writes to an unknown/shared production database.
export const isolatedTest=env=>env.FIREBASE_PROJECT_ID==='belgiepd-test';
export const intakeReady=env=>isolatedTest(env)&&env.BPD_ENABLE_CALLSIGN_REQUESTS==='true';
export const portalReady=env=>intakeReady(env)&&
  env.BPD_ENABLE_PORTAL_CALLSIGN_APPROVALS==='true'&&
  env.BPD_ENABLE_STAFF_DOSSIERS==='true';
