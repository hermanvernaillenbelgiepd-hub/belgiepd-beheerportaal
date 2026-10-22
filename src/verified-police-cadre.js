// Presentation-only verified Discord 9xx cadre label.
// Never use this result for portal access, personnel rank or a promotion.
import {roleSummary} from './role-catalog.js';
const MAX_ROLE_AGE_MS=24*60*60*1000;
const DISCORD_ID=/^\d{15,22}$/;
export function isPolice9xx(call){
  const raw=String(call||'').trim();
  return /^(?:S[- ]?)?9\d{2}$/i.test(raw);
}
export function verifiedOfficerCadre(member,guildId,now=Date.now()){
  if(!member||!DISCORD_ID.test(String(guildId||''))||member.guildId!==guildId||
     !Array.isArray(member.roleIds)||member.roleIds.some(id=>!DISCORD_ID.test(String(id)))||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now+60_000||
     now-member.verifiedAt>MAX_ROLE_AGE_MS)return null;
  const role=roleSummary(member.roleIds).policeRank;
  return role==='korpsleiding'?'Korpsleiding':
    role==='officierenkader'?'Officierenkader':null;
}
