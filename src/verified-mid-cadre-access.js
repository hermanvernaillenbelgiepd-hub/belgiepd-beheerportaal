import {verifiedDiscordIdentity,USER_COLLECTION,approvedManagedEntry} from './user-access.js';
import {roleSummary} from './role-catalog.js';
import {FieldValue} from 'firebase-admin/firestore';

export const AUTO_CADRE_ENV='BPD_AUTO_APPROVE_POLICE_MIDDENKADER';
export const AUTO_CADRE_SOURCE='discord_verified_middenkader';
const POLICE_ROLE='1309532438053130326',MIDDLE_ROLE='1335578488664490057';
const ELEVATED=['1473474238664020151','1353670078142615592'];
export const AUTO_CADRE_REFRESH_AGE=24*60*60*1000;
export function verifiedMiddleCandidate(decoded,member,guildId,env={},now=Date.now(),maxAge=15*60*1000){
  if(env[AUTO_CADRE_ENV]!=='true')return null;
  const id=verifiedDiscordIdentity(decoded,member,guildId,now,maxAge);
  if(!id)return null;
  const ids=new Set(member.roleIds);
  if(!ids.has(POLICE_ROLE)||!ids.has(MIDDLE_ROLE)||
     ELEVATED.some(x=>ids.has(x))||
     roleSummary(member.roleIds).policeRank!=='middenkader')return null;
  return {discordId:id,username:String(member.username||'Discord-lid').slice(0,80),
    role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'}};
}
export function stillEligibleAutoCadre(decoded,member,guildId,env,record,now=Date.now()){
  if(record?.approvalSource!==AUTO_CADRE_SOURCE)return true;
  if(!approvedManagedEntry(record,record.discordId))return false;
  const candidate=verifiedMiddleCandidate(decoded,member,guildId,env,now,AUTO_CADRE_REFRESH_AGE);
  return Boolean(candidate&&record.role==='middenkader'&&
    record.departments.length===1&&record.departments[0]==='politie'&&
    record.departmentRoles?.politie==='middenkader');
}
// Firestore transaction prevents first-login races; never reset blocked/approved users.
// User-supplied roles/ranks and Discord display names never authorise the transition.
export async function ensureVerifiedMiddleAccess(store,decoded,member,guildId,env,now=Date.now()){
  const candidate=verifiedMiddleCandidate(decoded,member,guildId,env,now);
  if(!candidate)return null;
  const ref=store.collection(USER_COLLECTION).doc(candidate.discordId);
  let result=null;
  await store.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    if(previous.exists&&previous.get('status')!=='pending'){
      result=previous.data();return;
    }
    const next={...candidate,guildId,status:'approved',approvalSource:AUTO_CADRE_SOURCE,
      approvedBy:'verified-discord-middle-role',
      approvedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
    if(!previous.exists){
      next.createdAt=FieldValue.serverTimestamp();
      next.requestedAt=FieldValue.serverTimestamp();
    }
    tx.set(ref,next,{merge:true});
    tx.create(ref.collection('audit').doc(),{
      action:'auto_approve_verified_mid_cadre',actorUid:decoded.uid,
      actorDiscordId:candidate.discordId,role:'middenkader',
      departments:['politie'],roleIds:[POLICE_ROLE,MIDDLE_ROLE],
      source:AUTO_CADRE_SOURCE,at:FieldValue.serverTimestamp()});
    result={...(previous.exists?previous.data():{}),...next};
  });
  return result;
}
