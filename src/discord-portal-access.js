// An authenticated Discord ID is only a login identity, never a role grant.
// A manually approved, unique mapping in BPD_ACCESS_JSON remains required.
export const DISCORD_PORTAL_MAX_AGE_MS=7*24*60*60*1000;
const ID=/^\d{15,22}$/;
export function discordPortalAccess(decoded,allowlist,member,guildId,now=Date.now()){
  if(!decoded||decoded.firebase?.sign_in_provider!=='custom'
    ||decoded.bpdDiscord!==true||typeof decoded.uid!=='string'
    ||!/^discord:\d{15,22}$/.test(decoded.uid)
    ||decoded.bpdGuildId!==guildId||!ID.test(guildId))return null;
  const discordId=decoded.uid.slice('discord:'.length);
  if(!member||member.guildId!==guildId||!Array.isArray(member.roleIds)
    ||!Number.isSafeInteger(member.verifiedAt)
    ||member.verifiedAt>now+60000
    ||now-member.verifiedAt>DISCORD_PORTAL_MAX_AGE_MS)return null;
  const matching=Object.entries(allowlist||{}).filter(([email,entry])=>
    typeof email==='string' && entry && typeof entry==='object'
    && entry.discordId===discordId);
  // Duplicate IDs must never silently choose one account with a higher role.
  if(matching.length!==1)return null;
  const [email,entry]=matching[0];
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
  return {email:email.toLowerCase(),entry,discordId};
}
