import {roleForDepartment} from './leave-policy.js';
import {choiceFor} from './service-function-policy.js';
// Bevoegdheden zijn expliciete, door het portaal goedgekeurde gegevens.
// Alleen expliciet ingeschakelde, recent geverifieerde Politie-Middenkader
// kan automatisch beperkte dienstgebonden portaaltoegang krijgen.
// Andere Discord-rollen blijven verificatie- en selectiesignalen.
export const USER_COLLECTION='bpd_portal_users';
export const MANAGED_ROLES=Object.freeze(['basiskader','middenkader','officierenkader','korpsleiding']);
export const USER_DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
// Administrative labels, not operational service memberships or access rights.
// BESTUUR uses independently verified Discord roles or approved appointments.
export const ACCOUNT_CATEGORIES=Object.freeze(['burger','technisch_medewerker']);
export function validAccountCategory(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['category','reason'].includes(k)))
    throw new Error('Ongeldige accountcategorie');
  if(!ACCOUNT_CATEGORIES.includes(body.category))
    throw new Error('Onbekende accountcategorie');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<10||reason.length>300)
    throw new Error('Motivering van 10 tot 300 tekens verplicht');
  return {category:body.category,reason};
}
export function mayLabelAccount(actor,subject,category){
  if(!actor||!subject||subject.status!=='approved'||
    !Array.isArray(subject.departments)||!canSeeUser(actor,subject)||
    actor.discordId===subject.discordId)return false;
  if(actor.role==='beheerder')return true;
  // Korpsleiding may mark existing police staff as civilian, not technicians.
  return category==='burger'&&actor.role==='korpsleiding'&&
    roleForDepartment(actor,'politie')==='korpsleiding'&&
    subject.departments.includes('politie');
}
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
  // Burgerraad is an independently authorized citizen function, not
  // a globally elevated cadre or a shortcut to other service rights.
  if(departments.includes('burger')&&role!=='basiskader')
    throw new Error('Burger kan alleen als basisportaalaccount worden toegevoegd');
  const reason=typeof body?.reason==='string'?body.reason.trim():'';
  if(reason.length<8||reason.length>300)throw new Error('Reden moet 8 tot 300 tekens bevatten');
  // Optional specialised portal function for a single new service account.
  // It cannot claim a cadre different from the approved role.
  const functionId=body?.functionId;
  if(functionId!==undefined&&
     (departments.length!==1||choiceFor(departments[0],functionId)?.role!==role))
    throw new Error('De geselecteerde dienstfunctie komt niet overeen met het portaalkader');
  return {role,departments:[...departments],
    departmentRoles:Object.fromEntries(departments.map(d=>[d,role])),reason,
    ...(functionId===undefined?{}:{functionId})};
}
// Each approver may only manage the rank formally held in the TARGET service.
// A global high role must never bleed into a second low-ranked department.
function ceilingIn(actor,dept){
  if(actor?.role==='beheerder')return 4;
  // Brandweer ZONE and fire command manage service dossiers, not the global
  // account-approval module. Dedicated board/technical grants remain separate.
  if(dept==='brandweer'&&
     (actor?.fireZoneChief===true||roleForDepartment(actor,'brandweer')==='korpsleiding'))return 0;
  // Medical leadership and instructors have service workspaces, not general
  // approval/blocking powers over portal users. Board/technical is distinct.
  if(dept==='ambulance')return 0;
  if(!['officierenkader','korpsleiding'].includes(actor?.role))return 0;
  const scoped=roleForDepartment(actor,dept);
  if((ranks[scoped]||0)>ranks[actor.role])return 0;
  return scoped==='korpsleiding'?3:scoped==='officierenkader'?2:0;
}
export function isUserManager(actor){
  if(actor?.role==='beheerder')return true;
  if(!Array.isArray(actor?.departments))return false;
  return actor.departments.some(d=>ceilingIn(actor,d)>0);
}
export function canSeeUser(actor,record){
  if(!isUserManager(actor))return false;
  if(actor.role==='beheerder')return true;
  const depts=record?.status==='pending'?record.candidateDepartments:record?.departments;
  return Array.isArray(depts)&&depts.some(d=>ceilingIn(actor,d)>0);
}
export function canChangeUser(actor,targetId,record,grant){
  if(!isUserManager(actor)||!ID.test(targetId)||targetId===actor.discordId||
     !record||!['pending','approved','blocked'].includes(record.status)||
     !Array.isArray(grant?.departments)||!grant.departments.length)return false;
  if(actor.role==='beheerder')return true;
  if(grant.departments.some(d=>(ranks[grant.role]||99)>ceilingIn(actor,d)))return false;
  if(record.status==='pending'){
    if(!grant.departments.every(d=>record.candidateDepartments?.includes(d)))return false;
  }else{
    if(!Array.isArray(record.departments)||!record.departments.length||
       record.departments.some(d=>(ranks[record.role]||99)>ceilingIn(actor,d)))return false;
  }
  return true;
}
export function canBlockUser(actor,targetId,record){
  if(!isUserManager(actor)||targetId===actor.discordId||
     !record||!['pending','approved','blocked'].includes(record.status))return false;
  if(actor.role==='beheerder')return true;
  if(record.status==='pending')return record.candidateDepartments?.some(d=>ceilingIn(actor,d)>0)===true;
  return Array.isArray(record.departments)&&record.departments.length>0&&
    record.departments.every(d=>(ranks[record.role]||99)<=ceilingIn(actor,d));
}
