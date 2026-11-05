// Authorized BelgiumPD API snapshot used ONLY for public/display
// qualifications in the organogram. Never persist into bpd_discord_auth;
// these snapshots must NOT be used for portal privileges or login decisions.
import {
 BPD_DISCORD_USERS_URL,parseDiscordUsersJsonLossless
} from './bpd-discord-users-probe.js';

const ID=/^\d{15,22}$/;
const MAX_BYTES=12*1024*1024;
const MAX_MEMBERS=30000;
const memberRows=data=>Array.isArray(data)?data:
 Array.isArray(data?.users)?data.users:
 Array.isArray(data?.members)?data.members:
 Array.isArray(data?.results)?data.results:
 Array.isArray(data?.data)?data.data:
 Array.isArray(data?.data?.users)?data.data.users:
 Array.isArray(data?.data?.members)?data.data.members:null;
async function readResponse(response){
 const declared=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_BYTES)return null;
 if(!response.body?.getReader){
  const body=await response.text();
  return Buffer.byteLength(body,'utf8')<=MAX_BYTES?body:null;
 }
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   length+=value.byteLength;
   if(length>MAX_BYTES){await reader.cancel();return null;}
   chunks.push(Buffer.from(value));
  }
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
const unavailable=status=>({status,entries:new Map(),memberCount:0,roleCount:0});
export async function fetchBelgiumPdDisplayRoles({env=process.env,fetchImpl=fetch}={}){
 const token=String(env.BPD_DISCORD_USERS_API_TOKEN||'').trim();
 if(token.length<8||/^(JOUW_|YOUR_|PLACEHOLDER|CHANGE_ME)/i.test(token))
  return unavailable('not_configured');
 try{
  const reply=await fetchImpl(BPD_DISCORD_USERS_URL,{
   method:'GET',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(11000)
  });
  if(reply.status===401)return unavailable('unauthorized');
  if(reply.status===403)return unavailable('forbidden');
  if(reply.status===429)return unavailable('rate_limited');
  if(!reply.ok)return unavailable('unavailable');
  const content=await readResponse(reply);
  if(content===null)return unavailable('oversize');
  let data;
  try{data=parseDiscordUsersJsonLossless(content);}
  catch{return unavailable('invalid_json');}
  const rows=memberRows(data);
  if(!rows||rows.length>MAX_MEMBERS)return unavailable('unexpected_schema');
  const entries=new Map();
  let roleCount=0;
  for(const member of rows){
   if(!member||typeof member!=='object'||Array.isArray(member)||
      typeof member.discord_id!=='string'||!ID.test(member.discord_id)||
      !Array.isArray(member.roles)||member.roles.length>500||
      entries.has(member.discord_id))
    return unavailable('invalid_or_duplicate_member');
   const roleIds=[];
   for(const role of member.roles){
    if(!role||typeof role!=='object'||Array.isArray(role)||
       typeof role.id!=='string'||!ID.test(role.id))
     return unavailable('invalid_role');
    roleIds.push(role.id);
   }
   entries.set(member.discord_id,[...new Set(roleIds)]);
   roleCount+=roleIds.length;
  }
  // An empty upstream response may be a temporary incident. Never use it to
  // assert that staff lost all of their roles.
  if(!entries.size)return unavailable('empty');
  return {status:'ok',entries,memberCount:entries.size,roleCount};
 }catch{return unavailable('connection_failed');}
}
// In-memory cache, 90s by default. Deduplicate requests from simultaneous
// profiles and fail closed on errors: do not serve a stale upstream snapshot.
export function createBelgiumPdDisplayRoleSource({
 load=fetchBelgiumPdDisplayRoles,now=Date.now,ttlMs=90000,failedTtlMs=15000
}={}){
 let cached=null,inflight=null;
 return async function loadDisplayRoles(){
  const time=now();
  if(cached&&cached.until>time)return cached.result;
  if(inflight)return inflight;
  const work=Promise.resolve().then(()=>load()).catch(()=>unavailable('connection_failed'));
  inflight=work.then(result=>{
   cached={result,until:now()+(result.status==='ok'?ttlMs:failedTtlMs)};
   return result;
  }).finally(()=>{inflight=null;});
  return inflight;
 };
}
export const getBelgiumPdDisplayRoles=createBelgiumPdDisplayRoleSource();

// Overlay is a NEW local map, scoped to one public organogram response.
// The cached OAuth/Firestore identities are never mutated or persisted.
export function organogramDisplayIdentityMap(cachedIdentities,apiSnapshot,people,guild,at=Date.now()){
 const entries=new Map(cachedIdentities?.entries||[]);
 let matches=0;
 // A duplicate ID within one service is an ambiguous personnel identity.
 // One person may legitimately serve in several DIFFERENT services.
 const seen=new Set(),ambiguous=new Set();
 for(const person of people){
  if(typeof person?.personId!=='string'||!ID.test(person.personId))continue;
  const key=person.dept+':'+person.personId;
  if(seen.has(key))ambiguous.add(person.personId);
  seen.add(key);
 }
 if(apiSnapshot?.status==='ok'&&ID.test(guild)){
  for(const person of people){
   const id=person?.personId;
   if(typeof id!=='string'||!ID.test(id)||ambiguous.has(id)||
      !apiSnapshot.entries.has(id))continue;
   const current=apiSnapshot.entries.get(id);
   entries.set(id,{guildId:guild,verifiedAt:at,roleIds:[...current],
    displaySource:'bpd-users-api'});
   matches++;
  }
 }
 return {entries,matches,fromApi:apiSnapshot?.status==='ok',
  apiMemberCount:apiSnapshot?.status==='ok'?apiSnapshot.memberCount:0};
}


// Restricted reconciliation report for technical management only.
// Uses exact Discord snowflakes; never guesses by name/callsign, writes data,
// or lists the wider Discord guild membership as operational staff.
export function diagnoseOrganogramRoleLinks(people,apiSnapshot){
 const roster=Array.isArray(people)?people:[];
 const rows=[],perService=new Map(),seen=new Set(),duplicates=new Set();
 for(const person of roster){
  const id=person?.personId,dept=String(person?.dept||'');
  if(!ID.test(String(id||'')))continue;
  const key=dept+':'+id;
  if(seen.has(key))duplicates.add(id);
  seen.add(key);
 }
 const stats={total:0,matched:0,missing:0,duplicate:0,withoutRoles:0};
 for(const person of roster){
  const dept=String(person?.dept||'');
  if(!dept||!ID.test(String(person?.personId||'')))continue;
  const id=person.personId;
  const service=perService.get(dept)||{dept,total:0,matched:0,missing:0,duplicate:0};
  service.total++;stats.total++;
  let status='matched';
  if(duplicates.has(id))status='duplicate';
  else if(apiSnapshot?.status!=='ok')status='unavailable';
  else if(!apiSnapshot.entries.has(id))status='missing';
  else if(!apiSnapshot.entries.get(id).length)status='without_roles';
  if(status==='matched'||status==='without_roles'){
   service.matched++;stats.matched++;
   if(status==='without_roles')stats.withoutRoles++;
  }else if(status==='missing'){service.missing++;stats.missing++;}
  else if(status==='duplicate'){service.duplicate++;stats.duplicate++;}
  perService.set(dept,service);
  if(status==='missing'||status==='duplicate')
   rows.push({dept,personId:id,call:String(person.call||'').slice(0,24),
    name:String(person.name||'').slice(0,90),status});
 }
 return {status:apiSnapshot?.status||'unavailable',stats,
  services:[...perService.values()].sort((a,b)=>a.dept.localeCompare(b.dept)),
  issues:rows.slice(0,250),displayOnly:true,accessRightsChanged:false};
}

export function exactApiDisplayRoles(snapshot,discordId){
 if(snapshot?.status!=='ok'||typeof discordId!=='string'||!ID.test(discordId)||
    !(snapshot.entries instanceof Map)||!snapshot.entries.has(discordId))return null;
 const roles=snapshot.entries.get(discordId);
 return Array.isArray(roles)&&roles.every(id=>typeof id==='string'&&ID.test(id))?
  [...new Set(roles)]:null;
}
