import {roleForDepartment} from './leave-policy.js';

export const DC_TRANSFER_REQUESTS='bpd_dc_id_transfer_requests';
export const DC_TRANSFER_ALIASES='bpd_identity_transfers';
export const DC_TRANSFER_TARGETS='bpd_identity_transfer_targets';
export const TRANSFER_DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
const ID=/^\d{15,22}$/;
const AGE=24*60*60*1000;

export function validTransferInput(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['oldDiscordId','newDiscordId','reason'].includes(k)))
   throw Error('Ongeldige overdrachtsgegevens');
 const oldDiscordId=String(body.oldDiscordId||'').trim();
 const newDiscordId=String(body.newDiscordId||'').trim();
 if(!ID.test(oldDiscordId)||!ID.test(newDiscordId)||oldDiscordId===newDiscordId)
   throw Error('Vul twee verschillende geldige Discord-ID’s in');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<20||reason.length>500||/[\x00-\x1f<>]/.test(reason))
   throw Error('Motivering van 20 tot 500 tekens vereist');
 return {oldDiscordId,newDiscordId,reason};
}
export function mayAdministerDcTransfer(actor){
 if(!actor||!ID.test(actor.discordId)||actor.uid!=='discord:'+actor.discordId)
   return false;
 const technical=actor.portalTechnicalMode===true&&
   actor.profileTechnicalAvailable===true;
 // General Bestuur access is not sufficient for identity migrations.
 // Only verified police command or the separately authorized technical profile.
 const police=actor.discordRosterEditorVerified===true&&
   actor.departments?.includes('politie')&&
   ['officierenkader','korpsleiding'].includes(actor.role)&&
   ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'));
 return technical||police;
}
// The same authorized officer can prepare and complete a transfer.
// Subject accounts may never transfer themselves, regardless of their cadre.
// Herinstroommeldingen zijn uitsluitend voor het geverifieerde politie-Officierenkader
// en de Korpsleiding. Technische DC-overdracht blijft een afzonderlijke bevoegdheid.
export function mayReviewPersonnelReentry(actor){
 return mayAdministerDcTransfer(actor)&&
   actor.discordRosterEditorVerified===true&&
   actor.departments?.includes('politie')&&
   ['officierenkader','korpsleiding'].includes(actor.role)&&
   ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'));
}
export function mayCompleteDcTransfer(actor,oldId,newId){
 return mayAdministerDcTransfer(actor)&&ID.test(oldId)&&ID.test(newId)&&
   oldId!==newId&&![oldId,newId].includes(actor.discordId);
}
export function freshTransferTarget(member,discordId,guildId,now=Date.now()){
 return ID.test(discordId)&&ID.test(guildId)&&member?.guildId===guildId&&
  Number.isSafeInteger(member.verifiedAt)&&member.verifiedAt<=now&&
  now-member.verifiedAt<=AGE&&Array.isArray(member.roleIds)&&
  member.roleIds.every(x=>typeof x==='string'&&ID.test(x));
}
export function transferRosterPlan(personnel,oldId,newId){
 if(!ID.test(oldId)||!ID.test(newId)||oldId===newId||!Array.isArray(personnel))
  throw Error('Ongeldige personeelscontrole');
 const old=personnel.filter(p=>p.personId===oldId);
 const existingNew=personnel.filter(p=>p.personId===newId);
 const depts=old.map(p=>p.dept);
 if(!old.length||old.some(p=>!TRANSFER_DEPARTMENTS.includes(p.dept))||
    new Set(depts).size!==depts.length)
   throw Error('Oude personeelsfiches ontbreken of zijn niet eenduidig');
 if(existingNew.length)throw Error('Nieuw Discord-ID heeft al een personeelsfiche: eerst conflict oplossen');
 return {departments:depts.sort(),personnel:old.map(p=>({
   department:p.dept,name:String(p.name||'').slice(0,80),
   call:String(p.call||'').slice(0,16),rank:String(p.rank||'').slice(0,80),
   source:p.source||'unknown'
 }))};
}
// Rewrite ONLY explicit subject references in the new owner's records.
// Historical actor IDs are intentionally retained for an accurate audit trail.
export function transferSubjectFields(value,oldId,newId){
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const next={...value};
 for(const key of ['discordId','personId','subjectDiscordId',
   'personDiscordId','applicantDiscordId']){
   if(next[key]===oldId)next[key]=newId;
 }
 return next;
}
// Rebuild subject references inside a lifecycle snapshot as well. Such snapshots
// are used to restore a member whose old Google Sheets row no longer exists.
// Never rewrite audit authors or other person's nested identities.
export function transferPersonDocument(value,collection,oldId,newId){
 const result=transferSubjectFields(value,oldId,newId);
 if(collection!=='bpd_personnel_lifecycle'||!result?.snapshot)return result;
 const previous=result.snapshot;
 if(typeof previous!=='object'||Array.isArray(previous)||previous.personId!==oldId)
   throw Error('De gearchiveerde personeelsidentiteit is niet eenduidig');
 const snapshot=transferSubjectFields(previous,oldId,newId);
 if(snapshot.id===snapshot.dept+':'+oldId)snapshot.id=snapshot.dept+':'+newId;
 return {...result,snapshot};
}

export function applyCompletedDcAliases(personnel,aliasDocs){
 const aliases=new Map();
 for(const d of aliasDocs||[]){
  const a=typeof d.data==='function'?d.data():d;
  const from=typeof d.id==='string'?d.id:a?.oldDiscordId;
  if(a?.status!=='completed'||!ID.test(from)||!ID.test(a.newDiscordId)||
    from===a.newDiscordId||aliases.has(from))continue;
  aliases.set(from,a.newDiscordId);
 }
 const seen=new Set();
 const result=[];
 for(const p of personnel||[]){
  const id=aliases.get(p.personId)||p.personId;
  const key=p.dept+':'+id;
  if(seen.has(key))continue;
  seen.add(key);
  result.push(id===p.personId?p:{...p,id:p.dept+':'+id,personId:id,
    sourceDiscordId:p.personId,identityTransferred:true});
 }
 return result;
}
