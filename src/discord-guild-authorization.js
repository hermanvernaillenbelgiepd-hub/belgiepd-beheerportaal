// Authorization-grade Discord membership check: ONLY Discord's authenticated
// guild-members endpoint, not the separate display/roster API or a UI claim.
// Membership is verified by exact Discord ID and guild on each cache refresh.
import {discordBotToken,verifiedBotMember} from './discord-bot-refresh.js';
const SNOWFLAKE=/^\d{15,22}$/;
const CACHE_OK=45000,CACHE_ERROR=7000;
const cache=new Map();
const no=status=>({status,roleIds:[]});
export async function verifyGuildAuthorizationRoles(id,{
 env=process.env,fetchImpl=fetch,now=Date.now,cacheResults=true
}={}){
 const guild=String(env.DISCORD_GUILD_ID||''),token=discordBotToken(env);
 if(!SNOWFLAKE.test(String(id||''))||!SNOWFLAKE.test(guild))
  return no('invalid_identity');
 if(!token)return no('bot_unavailable');
 const key=guild+':'+id,time=now();
 if(cacheResults){
  const hit=cache.get(key);
  if(hit&&hit.until>time)return hit.result;
 }
 let result;
 try{
  const response=await fetchImpl('https://discord.com/api/v10/guilds/'+guild+
   '/members/'+id,{method:'GET',headers:{
    Authorization:'Bot '+token,Accept:'application/json'
   },redirect:'error',signal:AbortSignal.timeout(3500)});
  if(response.status===404)result=no('not_member');
  else if(!response.ok)result=no('bot_unavailable');
  else{
   const parsed=verifiedBotMember(await response.json(),id);
   result=parsed?{status:'ok',roleIds:parsed.roleIds}:no('invalid_member');
  }
 }catch{result=no('bot_unavailable');}
 if(cacheResults){
  cache.set(key,{result,until:time+(['ok','not_member'].includes(result.status)?
   CACHE_OK:CACHE_ERROR)});
  if(cache.size>350){
   for(const [k,v] of cache)if(v.until<=time)cache.delete(k);
   if(cache.size>350)cache.delete(cache.keys().next().value);
  }
 }
 return result;
}
