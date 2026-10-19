import {testCreateEnabled,canCreatePersonnel} from './personnel-create.js';
import {verifiedDiscordIdentity} from './user-access.js';
const D=/^\d{15,22}$/,P=/^[A-Za-z0-9]{12,40}$/;
export function linkEnabled(env){
  return testCreateEnabled(env)&&env.BPD_ENABLE_PERSONNEL_WRITES==='true';
}
export function validateLinkReference(id){
  return typeof id==='string'&&P.test(id);
}
export function verifiedLinkRequester(decoded,member,guildId,now=Date.now()){
  return verifiedDiscordIdentity(decoded,member,guildId,now,15*60*1000);
}
export function mayApproveLink(actor,record,member,guildId,now=Date.now()){
  const link=record?.linkRequest;
  if(!record||record.state!=='awaiting_discord'||record.discordId!==null||
     !canCreatePersonnel(actor,record.dept)||!link||
     link.state!=='awaiting_approval'||!D.test(link.discordId)||
     actor.discordId===link.discordId||!member||
     member.guildId!==guildId||!D.test(guildId)||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now+60000||
     now-member.verifiedAt>7*24*60*60*1000||
     !Array.isArray(member.roleIds)||member.roleIds.some(x=>!D.test(x)))return false;
  // Candidate must still be the same recently verified Discord identity.
  return Number.isSafeInteger(link.verifiedAt)&&link.verifiedAt<=member.verifiedAt;
}
