// Read-only, narrowly scoped Discord K9 role verification for the public
// organogram. The bot role result is NEVER written to bpd_discord_auth or
// used to authorize an account: it affects the displayed K9 patch only.
import {discordBotToken,verifiedBotMember} from './discord-bot-refresh.js';
import {isDiscordId} from './discord-utils.js';
import {k9RoleFromRoleIds} from './k9-display-role.js';

const SUCCESS_TTL_MS=10*60*1000;
const NOT_FOUND_TTL_MS=90*1000;
const ERROR_TTL_MS=30*1000;
const MAX_CANDIDATES=32;
const WORKERS=8;
const cache=new Map();
const pending=new Map();

async function verifyK9Member(id,guild,token,fetchImpl,now,{force=false}={}){
 const key=guild+':'+id;
 const cached=cache.get(key);
 if(!force&&cached&&cached.expires>now)return cached.result;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  let result={verified:false,role:'',status:'network_error'},ttl=ERROR_TTL_MS;
  try{
   const response=await fetchImpl(
    'https://discord.com/api/v10/guilds/'+guild+'/members/'+id,{
     method:'GET',
     headers:{Authorization:'Bot '+token,Accept:'application/json'},
     signal:AbortSignal.timeout(3500),redirect:'error'
    });
   if(response.status===404){
    // A verified absence clears previously displayed automatic K9 roles.
    result={verified:true,role:'',status:'not_in_guild'};ttl=NOT_FOUND_TTL_MS;
   }else if(response.status===401||response.status===403){
    result={verified:false,role:'',status:'discord_forbidden'};
   }else if(response.status===429){
    result={verified:false,role:'',status:'discord_limited'};
   }else if(response.ok){
    const payload=await response.json();
    const member=verifiedBotMember(payload,id);
    if(member){
     const role=k9RoleFromRoleIds(member.roleIds);
     result={verified:true,role,status:role?'ok':'no_k9_role'};
     ttl=SUCCESS_TTL_MS;
    }else{
     result={verified:false,role:'',status:'invalid_member'};
    }
   }else{
    result={verified:false,role:'',status:'discord_unavailable'};
   }
  }catch{
   // The cached Firebase proof remains the fallback on bot/API failures.
  }
  cache.set(key,{result,expires:Date.now()+ttl});
  if(cache.size>1500){
   for(const [k,v] of cache)if(v.expires<=Date.now())cache.delete(k);
   if(cache.size>1500)cache.delete(cache.keys().next().value);
  }
  return result;
 })().finally(()=>pending.delete(key));
 pending.set(key,task);
 return task;
}

export async function refreshK9DisplayRoles(ids,{
 env=process.env,fetchImpl=fetch,now=Date.now()
}={}){
 const guild=String(env.DISCORD_GUILD_ID||''),token=discordBotToken(env);
 const roles=new Map();
 if(!isDiscordId(guild)||!token)return {available:false,roles,checked:0};
 const unique=[...new Set(ids)].filter(isDiscordId).slice(0,MAX_CANDIDATES);
 let index=0;
 const workers=Array.from({length:Math.min(WORKERS,unique.length)},async()=>{
  while(index<unique.length){
   const id=unique[index++];
   const result=await verifyK9Member(id,guild,token,fetchImpl,now);
   if(result.verified)roles.set(id,result.role);
  }
 });
 await Promise.all(workers);
 return {available:true,roles,checked:unique.length};
}

// A deliberate, officer/korps-only single-member check, bypassing short-term
// caches. The caller validates permissions and roster membership first.
// Only a safe status and a mapped K9 function leave this module.
export async function verifyK9DisplayRoleNow(personId,{
 env=process.env,fetchImpl=fetch,now=Date.now()
}={}){
 const guild=String(env.DISCORD_GUILD_ID||''),token=discordBotToken(env);
 if(!isDiscordId(personId))return {status:'invalid_person',role:'',verified:false};
 if(!isDiscordId(guild)||!token)
  return {status:'bot_unconfigured',role:'',verified:false};
 const result=await verifyK9Member(personId,guild,token,fetchImpl,now,{force:true});
 return {status:result.status,role:result.role,verified:result.verified};
}

// Candidates come from roster/registered K9 memberships, explicitly set
// manual display K9 roles, or older snapshots carrying a K9 Discord role.
// The snapshot is ONLY used to select who needs live verification; never to
// confer a role after its verification expires.
export function knownK9Candidate(person,merged,oldIdentity,manualRole,roleIds){
 if(person?.dept!=='politie'||!isDiscordId(person.personId))return false;
 if(manualRole||merged?.specialties?.includes('K9'))return true;
 // Some roster feeds record K9-IO as a training-only specialty. Use it
 // exclusively to discover whom to verify, never to award a K9 function.
 const raw=Array.isArray(person.specialties)?person.specialties:[];
 if(raw.some(item=>{
  const label=typeof item==='string'?item:String(item?.label||'');
  return /^K-?9[\s_-]*IO$/i.test(label.trim());
 }))return true;
 const roles=Array.isArray(oldIdentity?.roleIds)?oldIdentity.roleIds:[];
 return roleIds.some(id=>roles.includes(id));
}
