import {createHmac,timingSafeEqual} from 'node:crypto';
import {verifiedDiscordIdentity} from './user-access.js';
import {roleSummary} from './role-catalog.js';

// The owner-configured allowlist is a deliberate infrastructure grant.
// A matching username, Discord role, callsign or browser request is NEVER enough.
export const PROFILE_COOKIE='bpd_portal_profile';
export const PROFILE_SECONDS=3600;
const ID=/^\d{15,22}$/;
const departments=['politie','ambulance','brandweer','depannage'];

export function eligibleForTechnicalProfile(decoded,actor,member,env,now=Date.now()){
  if(!ID.test(actor?.discordId)||decoded?.uid!=='discord:'+actor.discordId)return false;
  if(verifiedDiscordIdentity(decoded,member,env.DISCORD_GUILD_ID,now,15*60000)!==actor.discordId)
    return false;
  const configured=String(env.BPD_TECHNICAL_ADMIN_DISCORD_IDS||'').split(',').map(s=>s.trim());
  return configured.includes(actor.discordId)&&
    typeof env.BPD_PORTAL_PROFILE_SIGNING_KEY==='string'&&
    env.BPD_PORTAL_PROFILE_SIGNING_KEY.length>=32;
}
export function verifiedPoliceRank(member,guildId,now=Date.now()){
  if(!member||member.guildId!==guildId||
    !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
    now-member.verifiedAt>15*60000||!Array.isArray(member.roleIds))
    return null;
  return roleSummary(member.roleIds).policeRank;
}
function sign(body,secret){
  return createHmac('sha256',secret).update(body).digest('base64url');
}
export function makeProfileCookie(uid,id,secret,now=Date.now()){
  if(typeof uid!=='string'||uid!=='discord:'+id||!ID.test(id)||
    typeof secret!=='string'||secret.length<32)throw Error('Geen veilige technische sessie mogelijk');
  const body=Buffer.from(JSON.stringify({v:1,uid,id,exp:now+PROFILE_SECONDS*1000})).toString('base64url');
  const token=body+'.'+sign(body,secret);
  return PROFILE_COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+PROFILE_SECONDS;
}
export function clearProfileCookie(){
  return PROFILE_COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
export function technicalCookieIsValid(header,uid,id,secret,now=Date.now()){
  if(!ID.test(id)||uid!=='discord:'+id||typeof secret!=='string'||secret.length<32)
    return false;
  const cookies=String(header||'').split(';').map(x=>x.trim());
  const found=cookies.find(x=>x.startsWith(PROFILE_COOKIE+'='));
  if(!found)return false;
  const token=found.slice(PROFILE_COOKIE.length+1);
  const parts=token.split('.');
  if(parts.length!==2||parts[0].length>512||parts[1].length!==43)return false;
  const expected=Buffer.from(sign(parts[0],secret));
  const received=Buffer.from(parts[1]);
  if(expected.length!==received.length||!timingSafeEqual(expected,received))return false;
  try{
    const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    return payload.v===1&&payload.uid===uid&&payload.id===id&&
      Number.isSafeInteger(payload.exp)&&payload.exp>now&&
      payload.exp<=now+PROFILE_SECONDS*1000;
  }catch{return false}
}
export function technicalActor(actor){
  return {...actor,operationalRole:actor.role,
    operationalDepartments:[...actor.departments],
    operationalDepartmentRoles:{...(actor.departmentRoles||{})},
    role:'beheerder',departments:[...departments],
    departmentRoles:Object.fromEntries(departments.map(d=>[d,'korpsleiding'])),
    portalTechnicalMode:true};
}
