// Automatische, controleerbare portaalgoedkeuring voor Politie-Basiskader.
// Elke toekenning vereist een eigen recente OAuth-gildeverificatie,
// de exacte Discord Politie-rol en exact één actieve 3xx-5xx politiefiche.
// Geen cross-service rolverhoging, en geen automatische toekenning van
// Middenkader, Officierenkader, Korpsleiding of dossierbeheer.
import {FieldValue} from 'firebase-admin/firestore';
import {verifiedDiscordIdentity,approvedManagedEntry,USER_COLLECTION} from './user-access.js';
import {roleSummary} from './role-catalog.js';
import {policeKader} from './normalize.js';
import {basicCallLevel} from './basic-observation-policy.js';
import {SERVICE_RANK} from './service-function-policy.js';

const ID=/^\d{15,22}$/;
export const AUTO_BASIC_SOURCE='discord_verified_police_basic';
export const POLICE_MEMBER_ROLE='1309532438053130326';
export const POLICE_BASIC_ROLE='1351212180120408166';
const HIGHER_POLICE_ROLES=Object.freeze([
 '1335578488664490057', // middenkader
 '1473474238664020151', // officierenkader
 '1562710901080068229'  // korpsleiding
]);
export const AUTO_BASIC_FRESH_MS=15*60*1000;
export const AUTO_BASIC_RECHECK_MS=24*60*60*1000;
const safeRoles=member=>new Set(Array.isArray(member?.roleIds)?member.roleIds:[]);
export function verifiedPoliceBasicRole(decoded,member,guildId,now=Date.now(),maxAge=AUTO_BASIC_FRESH_MS){
 const id=verifiedDiscordIdentity(decoded,member,guildId,now,maxAge);
 if(!id)return null;
 const roles=safeRoles(member);
 // The membership role is required. A separate Discord-Basiskader role
 // strengthens proof but is optional when the official roster says 3xx-5xx.
 if(!roles.has(POLICE_MEMBER_ROLE)||HIGHER_POLICE_ROLES.some(r=>roles.has(r)))return null;
 if(roleSummary(member.roleIds).policeRank &&
   roleSummary(member.roleIds).policeRank!=='basiskader')return null;
 return {discordId:id,baseRoleSeen:roles.has(POLICE_BASIC_ROLE)};
}
export function verifiedPoliceBasicCandidate(decoded,member,guildId,roster,now=Date.now()){
 const verified=verifiedPoliceBasicRole(decoded,member,guildId,now);
 if(!verified||!Array.isArray(roster))return null;
 const matches=roster.filter(p=>p?.dept==='politie'&&p.personId===verified.discordId&&
   p.lifecycleState!=='archived'&&p.lifecycleState!=='pending');
 if(matches.length!==1)return null;
 const p=matches[0],level=basicCallLevel(p);
 if(level===null||level<1||level>3||policeKader(p.rank,p.call)!=='Basiskader')return null;
 return {...verified,call:String(p.call||'').slice(0,24)};
}
export function autoPoliceBasicActive(decoded,member,guildId,record,now=Date.now()){
 if(record?.autoPoliceBasic?.source!==AUTO_BASIC_SOURCE)return true;
 if(record?.status!=='approved'||record?.departmentRoles?.politie!=='basiskader')
   return false;
 return Boolean(verifiedPoliceBasicRole(decoded,member,guildId,now,AUTO_BASIC_RECHECK_MS));
}
export function hideUnverifiedAutoPoliceBasic(entry){
 if(!entry?.departments?.includes('politie'))return entry;
 const departments=entry.departments.filter(d=>d!=='politie');
 if(!departments.length)return null;
 const departmentRoles=Object.fromEntries(
  Object.entries(entry.departmentRoles||{}).filter(([d])=>departments.includes(d)));
 const role=Object.values(departmentRoles).reduce((high,next)=>
   (SERVICE_RANK[next]||0)>(SERVICE_RANK[high]||0)?next:high,'basiskader');
 return {...entry,departments,departmentRoles,role};
}
export async function ensureVerifiedPoliceBasicAccess(store,decoded,member,guildId,roster,now=Date.now()){
 const candidate=verifiedPoliceBasicCandidate(decoded,member,guildId,roster,now);
 if(!candidate)return {changed:false,reason:'not_verified'};
 const ref=store.collection(USER_COLLECTION).doc(candidate.discordId);
 let changed=false;
 await store.runTransaction(async tx=>{
  const before=await tx.get(ref);
  const old=before.exists?before.data():null;
  // A blocked account or an invalid existing approval is never repaired
  // by role syncing. Such cases require explicit management review.
  if(old&&old.status!=='pending'&&old.status!=='approved')return;
  const approved=old?.status==='approved'?
    approvedManagedEntry(old,candidate.discordId):null;
  if(old?.status==='approved'&&!approved)return;
  if(approved?.departments.includes('politie'))return;
  const departments=[...(approved?.departments||[]),'politie'];
  const departmentRoles={...(approved?.departmentRoles||{}),politie:'basiskader'};
  const role=Object.values(departmentRoles).reduce((high,next)=>
   (SERVICE_RANK[next]||0)>(SERVICE_RANK[high]||0)?next:high,'basiskader');
  const mark={source:AUTO_BASIC_SOURCE,role:'basiskader',
   policeMemberRoleId:POLICE_MEMBER_ROLE,
   basicRoleSeen:candidate.baseRoleSeen,
   rosterCall:candidate.call,verifiedAt:now};
  const updated={discordId:candidate.discordId,role,departments,
   departmentRoles,status:'approved',autoPoliceBasic:mark,
   updatedAt:FieldValue.serverTimestamp()};
  if(!approved){
   updated.guildId=guildId;
   updated.username=String(member.username||'Discord-lid').slice(0,80);
   updated.approvalSource=AUTO_BASIC_SOURCE;
   updated.approvedBy='verified-discord-police-roster';
   updated.approvedAt=FieldValue.serverTimestamp();
   if(!before.exists){
    updated.createdAt=FieldValue.serverTimestamp();
    updated.requestedAt=FieldValue.serverTimestamp();
   }
  }
  tx.set(ref,updated,{merge:true});
  tx.create(ref.collection('audit').doc(),{
   action:'auto_approve_verified_police_basic',department:'politie',
   role:'basiskader',roleIds:[POLICE_MEMBER_ROLE,
      ...(candidate.baseRoleSeen?[POLICE_BASIC_ROLE]:[])],
   rosterCall:candidate.call,actorUid:decoded.uid,
   previousDepartments:approved?.departments||[],
   preservedOtherDepartments:true,
   at:FieldValue.serverTimestamp()
  });
  changed=true;
 });
 return {changed,reason:changed?'approved':'already_managed_or_conflict'};
}
