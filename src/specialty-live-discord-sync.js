// Display-only, on-demand Discord role check for a selected personnel card.
// Never changes roles, persists Discord evidence, or confers portal privileges.
import {discordBotToken,verifiedBotMember} from './discord-bot-refresh.js';
import {isDiscordId} from './discord-utils.js';

export async function verifyLiveSpecialtyRoles(personId,{
 env=process.env,fetchImpl=fetch
}={}){
 const guild=String(env.DISCORD_GUILD_ID||''),token=discordBotToken(env);
 if(!isDiscordId(personId))return {verified:false,status:'invalid_person'};
 if(!isDiscordId(guild)||!token)return {verified:false,status:'bot_unconfigured'};
 try{
  const response=await fetchImpl(
   'https://discord.com/api/v10/guilds/'+guild+'/members/'+personId,{
    method:'GET',
    headers:{Authorization:'Bot '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(3500),redirect:'error'
   });
  if(response.status===404)return {verified:true,status:'not_in_guild',roleIds:[]};
  if(response.status===429)return {verified:false,status:'rate_limited'};
  if(!response.ok)return {verified:false,status:'discord_unavailable'};
  const member=verifiedBotMember(await response.json(),personId);
  if(!member)return {verified:false,status:'invalid_member'};
  return {verified:true,status:'ok',roleIds:member.roleIds};
 }catch{
  return {verified:false,status:'network_error'};
 }
}
