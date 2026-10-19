import {policeKader} from './normalize.js';
import {recentDiscordMember} from './permissions-utils.js';

// Reconcile ONLY an already approved *legacy* officer assignment whose
// police department role was accidentally left at middle cadre. All three
// independent signals must agree: existing approved global rank, fresh
// verified Discord officer role, and unique officer rank in personnel records.
// This does not modify the allowlist or grant any other department privileges.
export const OFFICER_DISCORD_ROLE='1473474238664020151';
export function reconcileLegacyPoliceOfficer(entry,discordId,member,personnel,guildId,now=Date.now()){
  if(!entry||entry.role!=='officierenkader'||
     !Array.isArray(entry.departments)||!entry.departments.includes('politie')||
     !entry.departmentRoles||entry.departmentRoles.politie!=='middenkader'||
     !/^\d{15,22}$/.test(String(discordId||'')))return null;
  if(!recentDiscordMember(member,guildId,now)||
     !member.roleIds.includes(OFFICER_DISCORD_ROLE))return null;
  const found=Array.isArray(personnel)?
    personnel.filter(p=>p?.dept==='politie'&&p?.personId===discordId):[];
  if(found.length!==1||policeKader(found[0].rank)!=='Officierenkader')return null;
  return {...entry,departmentRoles:{...entry.departmentRoles,politie:'officierenkader'}};
}
