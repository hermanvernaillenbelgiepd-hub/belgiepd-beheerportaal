// Presentation-only verified Discord 9xx cadre label.
// Never use this result for portal access, personnel rank or a promotion.
import {roleSummary} from './role-catalog.js';
const MAX_ROLE_AGE_MS=24*60*60*1000;
// One authenticated workday for a verified Corps leader. Unlike general portal
// login (7 days), protected operational rights still expire after eight hours.
export const VERIFIED_CORPS_SESSION_MS=8*60*60*1000;
const DISCORD_ID=/^\d{15,22}$/;
export function isPolice9xx(call){
  const raw=String(call||'').trim();
  return /^(?:S[- ]?)?9\d{2}$/i.test(raw);
}
export function verifiedOfficerCadre(member,guildId,now=Date.now(),maxAge=MAX_ROLE_AGE_MS){
  if(!member||!DISCORD_ID.test(String(guildId||''))||member.guildId!==guildId||
     !Array.isArray(member.roleIds)||member.roleIds.some(id=>!DISCORD_ID.test(String(id)))||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now+60_000||
     now-member.verifiedAt>maxAge)return null;
  const role=roleSummary(member.roleIds).policeRank;
  return role==='korpsleiding'?'Korpsleiding':
    role==='officierenkader'?'Officierenkader':null;
}

// Only a Corps leader may use their own 9xx personnel evidence during the
// authenticated workday. The exact signed Discord identity, approved Police
// Korpsleiding role and a guild-bound role proof must ALL still agree.
export function verifiedCorpsSelfDossier(actor,subjectId,member,guildId,now=Date.now()){
  if(typeof subjectId!=='string'||!DISCORD_ID.test(subjectId)||
    actor?.uid!=='discord:'+subjectId||actor.discordId!==subjectId||
    actor.role!=='korpsleiding'||actor.departmentRoles?.politie!=='korpsleiding'||
    !actor.departments?.includes('politie'))return false;
  return verifiedOfficerCadre(member,guildId,now,VERIFIED_CORPS_SESSION_MS)==='Korpsleiding';
}
