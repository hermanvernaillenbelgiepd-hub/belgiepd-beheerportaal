import {roleForDepartment} from './leave-policy.js';
import {TRAINING_ROLE_IDS} from './role-catalog.js';

const DISCORD=/^\d{15,22}$/;
const MAX_PROOF_AGE=24*60*60*1000;
const POLICE_MIDDLE='1335578488664490057';
const POLICE_OFFICER='1473474238664020151';
const POLICE_CORPS='1562710901080068229';
const FIRE_MIDDLE='1554906632897560787';
const FIRE_LEAD='1395115819020714105';
const MEDICAL_LEAD='1309532438053130325';
const TOW_AWV='1309532438019706969';
const CITIZEN_COUNCIL='1492485336197234728';

const denied=()=>({all:false,departments:[]});
function freshRoleIds(member,guildId,now){
 if(!member||!DISCORD.test(String(guildId||''))||member.guildId!==guildId||
    !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now+60000||
    now-member.verifiedAt>MAX_PROOF_AGE||!Array.isArray(member.roleIds)||
    !member.roleIds.every(x=>DISCORD.test(String(x))))return null;
 return new Set(member.roleIds);
}
/** Copy-only personnel ID scope. This cannot authorize dossiers, edits or audit access. */
export function personnelPingScopes(actor,member,guildId,now=Date.now()){
 if(!actor||!DISCORD.test(String(actor.discordId||''))||
   actor.uid!=='discord:'+actor.discordId)return denied();
 // Technical profile must already have been validated by requireUser against
 // the signed cookie and configured technical-admin Discord allowlist.
 if(actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true&&
    actor.role==='beheerder')return {all:true,departments:[]};
 const roles=freshRoleIds(member,guildId,now);
 if(!roles)return denied();
 const has=role=>roles.has(role);
 const belongs=dept=>actor.departments?.includes(dept)===true;
 const scoped=dept=>roleForDepartment(actor,dept);
 const teaches=dept=>(TRAINING_ROLE_IDS[dept]?.instructors||[]).some(has);
 const policeOfficer=belongs('politie')&&actor.discordRosterEditorVerified===true&&
    ['officierenkader','korpsleiding'].includes(scoped('politie'))&&
    (has(POLICE_OFFICER)||has(POLICE_CORPS));
 if(policeOfficer)return {all:true,departments:[]};
 const result=[];
 if(belongs('politie')&&(
    ['middenkader','officierenkader','korpsleiding'].includes(scoped('politie'))&&
      [POLICE_MIDDLE,POLICE_OFFICER,POLICE_CORPS].some(has)||
    teaches('politie')))result.push('politie');
 if(belongs('brandweer')&&(
    [FIRE_MIDDLE,FIRE_LEAD].some(has)||teaches('brandweer')||
    actor.fireZoneChief===true))result.push('brandweer');
 if(belongs('ambulance')&&(has(MEDICAL_LEAD)||teaches('ambulance')))
    result.push('ambulance');
 if(belongs('depannage')&&has(TOW_AWV))result.push('depannage');
 if(belongs('burger')&&has(CITIZEN_COUNCIL))result.push('burger');
 return {all:false,departments:result};
}
