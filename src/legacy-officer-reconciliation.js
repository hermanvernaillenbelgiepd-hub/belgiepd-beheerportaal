import {policeKader} from './normalize.js';
import {MAX_DISCORD_AGE} from './user-access.js';
import {isDiscordId} from './discord-utils.js';

// Reconcile ONLY an already approved *legacy* officer assignment whose
// police department role was accidentally left at middle cadre. All three
// independent signals must agree: existing approved global rank, validated
// Discord officer role, and unique officer rank in personnel records.
// This role-check uses the portal's verified-session lifetime (7 days), not
// the 15-minute TTL for sensitive training-role management commands.
// This does not modify the allowlist or grant any other department privileges.
export const OFFICER_DISCORD_ROLE='1473474238664020151';
export function reconcileLegacyPoliceOfficer(entry,discordId,member,personnel,guildId,now=Date.now()){
  if(!entry||entry.role!=='officierenkader'||
     !Array.isArray(entry.departments)||!entry.departments.includes('politie')||
     !entry.departmentRoles||entry.departmentRoles.politie!=='middenkader'||
     !/^\d{15,22}$/.test(String(discordId||'')))return null;
  if(!member||member.guildId!==guildId||!isDiscordId(guildId)||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
     now-member.verifiedAt>MAX_DISCORD_AGE||!Array.isArray(member.roleIds)||
     member.roleIds.some(role=>!isDiscordId(role))||
     !member.roleIds.includes(OFFICER_DISCORD_ROLE))return null;
  const found=Array.isArray(personnel)?
    personnel.filter(p=>p?.dept==='politie'&&p?.personId===discordId):[];
  if(found.length!==1||policeKader(found[0].rank)!=='Officierenkader')return null;
  return {...entry,departmentRoles:{...entry.departmentRoles,politie:'officierenkader'}};
}
