// Bevoegdheden zijn expliciete, door het portaal goedgekeurde gegevens.
// Discord-rollen zijn uitsluitend verificatie- en selectiesignalen.
export const USER_COLLECTION='bpd_portal_users';
export const MANAGED_ROLES=Object.freeze(['basiskader','middenkader','officierenkader','korpsleiding']);
export const USER_DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
const ranks={basiskader:1,middenkader:2,officierenkader:3,korpsleiding:4,beheerder:5};
const ID=/^\d{15,22}$/;
export const MAX_DISCORD_AGE=7*24*60*60*1000;
export function verifiedDiscordIdentity(decoded,member,guildId,now=Date.now(),maxAge=MAX_DISCORD_AGE){
  if(!decoded||decoded.firebase?.sign_in_provider!=='custom'||decoded.bpdDiscord!==true||
     decoded.bpdGuildId!==guildId||typeof decoded.uid!=='string'||!/^discord:\d{15,22}$/.test(decoded.uid))return null;
  const id=decoded.uid.slice(8);
  if(!ID.test(guildId)||!member||member.guildId!==guildId||
    !Array.isArray(member.roleIds)||member.roleIds.some(x=>!ID.test(x))||
    !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now+60000||
    now-member.verifiedAt>maxAge)return null;
  return id;
}
export function approvedManagedEntry(data,id){
  if(!ID.test(id)||!data||data.status!=='approved'||data.discordId!==id)return null;
  if(!MANAGED_ROLES.includes(data.role)||!Array.isArray(data.departments)||
     !data.departments.length||data.departments.some(d=>!USER_DEPTS.includes(d))||
     new Set(data.departments).size!==data.departments.length)return null;
  const raw=data.departmentRoles;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     data.departments.some(d=>!MANAGED_ROLES.includes(raw[d]))||
     Object.keys(raw).some(d=>!data.departments.includes(d)))return null;
  // No elevated role in a secondary department outside the approved global ceiling.
  if(data.departments.some(d=>ranks[raw[d]]>ranks[data.role]))return null;
  return {role:data.role,departments:[...data.departments],
    departmentRoles:{...raw},discordId:id};
}
export function validUserGrant(body){
  const role=String(body?.role||'');
  const departments=body?.departments;
  if(!MANAGED_ROLES.includes(role)||!Array.isArray(departments)||departments.length<1||
     departments.length>USER_DEPTS.length||departments.some(d=>!USER_DEPTS.includes(d))||
     new Set(departments).size!==departments.length)throw new Error('Ongeldige functie of hulpdiensten');
  const reason=typeof body?.reason==='string'?body.reason.trim():'';
  if(reason.length<8||reason.length>300)throw new Error('Reden moet 8 tot 300 tekens bevatten');
  return {role,departments:[...departments],
    departmentRoles:Object.fromEntries(departments.map(d=>[d,role])),reason};
}
export function isUserManager(actor){
  return Boolean(actor&&['officierenkader','korpsleiding','beheerder'].includes(actor.role));
}
export function canSeeUser(actor,record){
  if(!isUserManager(actor))return false;
  if(actor.role==='beheerder')return true;
  const depts=record.status==='pending'?record.candidateDepartments:record.departments;
  return Array.isArray(depts)&&depts.some(d=>actor.departments?.includes(d));
}
export function canChangeUser(actor,targetId,record,grant){
  if(!isUserManager(actor)||!ID.test(targetId)||targetId===actor.discordId||
     !record||!['pending','approved','blocked'].includes(record.status)||
     !Array.isArray(grant?.departments)||!grant.departments.length)return false;
  if(actor.role==='beheerder')return true;
  const ceiling=actor.role==='korpsleiding'?3:2;
  if((ranks[grant.role]||99)>ceiling||
     grant.departments.some(d=>!actor.departments?.includes(d)))return false;
  if(record.status==='pending'){
    // Incoming staff must actually have a Discord department association.
    if(!grant.departments.every(d=>record.candidateDepartments?.includes(d)))return false;
  }else{
    if(!Array.isArray(record.departments)||record.departments.some(d=>!actor.departments?.includes(d)))return false;
    if((ranks[record.role]||99)>ceiling)return false;
  }
  return true;
}
export function canBlockUser(actor,targetId,record){
  if(!isUserManager(actor)||targetId===actor.discordId||
     !record||!['pending','approved','blocked'].includes(record.status))return false;
  if(actor.role==='beheerder')return true;
  const ceiling=actor.role==='korpsleiding'?3:2;
  if(record.status==='pending')return record.candidateDepartments?.some(d=>actor.departments?.includes(d))===true;
  return Array.isArray(record.departments)&&record.departments.every(d=>actor.departments?.includes(d))&&
    (ranks[record.role]||99)<=ceiling;
}
