// Beperkte, automatische portaaltoegang na eigen Discord OAuth en een
// eenduidige actieve personeelsfiche. Een rol op Discord alleen volstaat nooit.
// Hoger kader/technisch beheer/Burgerraad blijven uitdrukkelijk handmatig.
import {FieldValue} from 'firebase-admin/firestore';
import {verifiedDiscordIdentity,approvedManagedEntry,USER_COLLECTION} from './user-access.js';
import {basicCallLevel} from './basic-observation-policy.js';
import {policeKader} from './normalize.js';

export const AUTO_REGULAR_SOURCE='verified_discord_regular_personnel';
export const REGULAR_RECHECK_MS=24*60*60*1000;
const FRESH_MS=15*60*1000;
const MEMBER_ROLES=Object.freeze({
 politie:['1309532438053130326'],
 brandweer:['1309532438053130324'],
 ambulance:['1309532438053130323'],
 depannage:['1309532438019706971','1309532438019706970']
});
// Do not auto-approve any account that claims operational leadership,
// board powers, an instructor management role, or a technical administrator ID.
// Every excluded case can still use the existing manual approval workflow.
const ELEVATED=new Set([
 '1335578488664490057','1473474238664020151','1562710901080068229',
 '1353670078142615592','1554906632897560787','1395115819020714105',
 '1309532437952466989','1309532437952466988','1309532438053130325',
 '1309532438019706969','1492485336197234728','1309532438082355251'
]);
const STOP_STATUSES=new Set(['ONTSLAG','VERWIJDERD','BLACKLISTED','GESCHORST',
 'INACTIEF','RESTRICTED']);
const leadershipRank={
 brandweer:/zonechef|kolonel|majoor|kapitein|luitenant|sergeant|adjudant|leiding|instructeur/i,
 ambulance:/dir.?med|leiding|hoofdarts|hoofdverpleegkundige|harts|hvpk|hamb|instructeur/i,
 depannage:/\bawv\b|leiding|instructeur/i
};
const roleSet=member=>new Set(member.roleIds);
const technicalId=(id,env)=>String(env?.BPD_TECHNICAL_ADMIN_DISCORD_IDS||'')
 .split(',').map(x=>x.trim()).includes(id);
function functionsFor(dept,roles,person){
 if(dept==='politie'){
   const level=basicCallLevel(person);
   const kader=policeKader(person.rank,person.call);
   const basicFlag=roles.has('1351212180120408166');
   if(level===0&&kader==='Agentenkader'&&!basicFlag){
     // Alleen definitieve 2xx, geen tijdelijke 1xx of hogere 6xx+.
     if(!/(?:^|[- ])2\d{2}$/.test(String(person.call||'')))return null;
     return 'agentenkader';
   }
   if(level>=1&&level<=3&&kader==='Basiskader')return 'basiskader';
   return null;
 }
 if(leadershipRank[dept]?.test(String(person.rank||'')))return null;
 if(dept==='ambulance'){
   if(roles.has('1309532437977497695'))return 'arts';
   if(roles.has('1309532437977497696'))return 'verpleegkundige';
   return 'ambulance';
 }
 if(dept==='brandweer')return 'brandweer';
 if(dept==='depannage')return roles.has('1309532438019706970')?'fast':'lsra';
 return null;
}
function ordinaryDepartments(roles){
 return Object.entries(MEMBER_ROLES).filter(([,ids])=>ids.some(id=>roles.has(id)))
   .map(([dept])=>dept);
}
function safePerson(person,dept,id){
 return person?.dept===dept&&person.personId===id&&
   !['archived','pending'].includes(String(person.lifecycleState||'').toLowerCase())&&
   !STOP_STATUSES.has(String(person.status||'').trim().toUpperCase());
}
export function verifiedRegularCandidate(decoded,member,guildId,roster,env={},now=Date.now()){
 const id=verifiedDiscordIdentity(decoded,member,guildId,now,FRESH_MS);
 if(!id||!Array.isArray(roster)||technicalId(id,env))return null;
 const roles=roleSet(member);
 if([...roles].some(role=>ELEVATED.has(role)))return null;
 const departments=ordinaryDepartments(roles);
 if(!departments.length)return null;
 const serviceFunctions={},proof={};
 for(const dept of departments){
   const found=roster.filter(person=>safePerson(person,dept,id));
   // An archived/blocked duplicate is not an excuse to choose a different
   // dossier. Require a unique source identity for each selected department.
   if(roster.filter(p=>p?.dept===dept&&p.personId===id).length!==1||
      found.length!==1)return null;
   const fn=functionsFor(dept,roles,found[0]);
   if(!fn)return null;
   serviceFunctions[dept]=fn;
   proof[dept]=String(found[0].call||'').slice(0,24);
 }
 return {discordId:id,username:String(member.username||'Discord-lid').slice(0,80),
   role:'basiskader',departments,
   departmentRoles:Object.fromEntries(departments.map(d=>[d,'basiskader'])),
   serviceFunctions,proof};
}
export function stillEligibleAutoRegular(decoded,member,guildId,record,env={},now=Date.now()){
 if(record?.approvalSource!==AUTO_REGULAR_SOURCE)return true;
 if(!approvedManagedEntry(record,record.discordId)||
    technicalId(record.discordId,env)||
    verifiedDiscordIdentity(decoded,member,guildId,now,REGULAR_RECHECK_MS)!==record.discordId)
   return false;
 const roles=roleSet(member);
 if([...roles].some(role=>ELEVATED.has(role)))return false;
 const departments=ordinaryDepartments(roles);
 return record.role==='basiskader'&&departments.length===record.departments.length&&
   departments.every(d=>record.departments.includes(d)&&
     record.departmentRoles?.[d]==='basiskader');
}
export async function ensureVerifiedRegularAccess(store,decoded,member,guildId,roster,env={},now=Date.now()){
 const candidate=verifiedRegularCandidate(decoded,member,guildId,roster,env,now);
 if(!candidate)return {changed:false,reason:'verification_or_roster_missing'};
 const ref=store.collection(USER_COLLECTION).doc(candidate.discordId);
 let changed=false;
 await store.runTransaction(async tx=>{
   const prior=await tx.get(ref);
   const before=prior.exists?prior.data():null;
   // Never re-enable an explicitly blocked/revoked or manually approved
   // account. Manual privilege changes take priority over automated sync.
   if(before&&(before.status!=='pending'||before.autoPoliceBasicBlocked===true))return;
   const {proof,...grant}=candidate;
   const next={...grant,guildId,status:'approved',
     approvalSource:AUTO_REGULAR_SOURCE,approvedBy:'verified-discord-and-personnel',
     approvedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
   if(!prior.exists){
     next.createdAt=FieldValue.serverTimestamp();
     next.requestedAt=FieldValue.serverTimestamp();
   }
   tx.set(ref,next,{merge:true});
   tx.create(ref.collection('audit').doc(),{
     action:'auto_approve_verified_regular_personnel',
     actorUid:decoded.uid,actorDiscordId:candidate.discordId,
     departments:candidate.departments,serviceFunctions:candidate.serviceFunctions,
     rosterCalls:proof,source:AUTO_REGULAR_SOURCE,at:FieldValue.serverTimestamp()
   });
   changed=true;
 });
 return {changed,reason:changed?'approved':'existing_decision'};
}
