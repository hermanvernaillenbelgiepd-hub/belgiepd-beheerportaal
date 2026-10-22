import {isDiscordId} from './discord-utils.js';

// A manual bot refresh is read-only against Discord. Only an authenticated
// Discord identity may refresh its OWN cached membership. No client may supply
// an arbitrary member ID, bot token, roles or service permissions.
export const MANUAL_BOT_REFRESH_COOLDOWN_MS=60000;
export function discordBotToken(env={}){
  const token=String(env.BPD_DISCORD_BOT_TOKEN||env.DISCORD_BOT_TOKEN||'').trim();
  return token.length>=35&&!/^(JOUW_|YOUR_|PLACEHOLDER|CHANGE_ME)/i.test(token)?token:null;
}
export function botRefreshAllowed(decoded,member,guildId){
  if(!isDiscordId(guildId)||!decoded||decoded.firebase?.sign_in_provider!=='custom'||
    decoded.bpdDiscord!==true||decoded.bpdGuildId!==guildId||
    typeof decoded.uid!=='string'||!/^discord:\d{15,22}$/.test(decoded.uid))return false;
  return Boolean(member&&member.guildId===guildId&&
    Number.isSafeInteger(member.verifiedAt)&&member.verifiedAt>0&&
    Array.isArray(member.roleIds)&&member.roleIds.every(isDiscordId));
}
export function botRefreshTooSoon(member,now=Date.now()){
  return Number.isSafeInteger(member?.botRefreshedAt)&&
    member.botRefreshedAt<=now&&now-member.botRefreshedAt<MANUAL_BOT_REFRESH_COOLDOWN_MS;
}
export function verifiedBotMember(payload,discordId){
  if(!isDiscordId(discordId)||!payload||typeof payload!=='object'||
    Array.isArray(payload)||!Array.isArray(payload.roles)||
    payload.roles.length>500||payload.roles.some(id=>!isDiscordId(id))||
    !payload.joined_at||Number.isNaN(Date.parse(payload.joined_at))||
    (payload.user?.id!=null&&payload.user.id!==discordId))return null;
  return {roleIds:[...new Set(payload.roles)],joinedAt:String(payload.joined_at)};
}
