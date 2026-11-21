import {roleForDepartment} from './leave-policy.js';
import {activeBoardAppointment} from './board-appointment-policy.js';
import {VERIFIED_CORPS_SESSION_MS} from './verified-police-cadre.js';
import {isVerifiedReportCorpsReader} from './fortnight-report-policy.js';

export const SERVICE_DOSSIER_DEPARTMENTS=Object.freeze(['politie','ambulance','brandweer','depannage']);
const DISCORD=/^\d{15,22}$/;
const DISCORD_BOARD_ROLE='1309532438082355251';
const DISCORD_AWV_ROLE='1309532438019706969';
const DISCORD_FAST_ROLE='1309532438019706970';
const DISCORD_LSRA_ROLE='1309532438019706971';
const DISCORD_AZLS_ROLE='1309532438053130325';
// A role snapshot is evidence only when fetched for the authenticated guild member.
// This module never accepts a display name, a radio label or a client-side claim.
const verifiedRoles=(member,guildId,now)=>{
  if(!member||typeof guildId!=='string'||!DISCORD.test(guildId)||
     member.guildId!==guildId||!Number.isSafeInteger(member.verifiedAt)||
     member.verifiedAt>now||
     !Array.isArray(member.roleIds)||!member.roleIds.every(x=>DISCORD.test(x)))return new Set();
  const age=now-member.verifiedAt;
  if(age<=15*60*1000)return new Set(member.roleIds);
  // Narrow exception: keep only the dual Board+Corps proof within eight
  // hours; expired ambulance/depannage/other service roles stay unavailable.
  if(age<=VERIFIED_CORPS_SESSION_MS&&member.roleIds.includes(DISCORD_BOARD_ROLE)&&
     member.roleIds.includes('1309532438053130326')&&
     member.roleIds.includes('1562710901080068229'))
    return new Set([DISCORD_BOARD_ROLE]);
  return new Set();
};
const code=text=>typeof text==='string'?text.trim().toUpperCase().replace(/\s+/g,' '):'';
const AMBULANCE=/^(?:DIRMED|HARTS|HVPK|HAMB)(?:[- ]?\d{1,4})?$/;
const ZONE=/^ZONE(?:[- ]?\d{1,3}|[ -]COMMANDANT(?:E)?)?$/;
const AWV=/^(?:(?:AWV|ANWV)(?:[- ]?\d{1,4}|[ -]LEIDING)?|AGENTSCHAP WEGEN (?:EN|&) VERKEER(?:[ -]\(?LEIDING\)?)?)$/;
const matchesDuty=(person,pattern)=>pattern.test(code(person?.call))||pattern.test(code(person?.rank));
// Fire brigade administrative privileges require an unambiguous official ZONE
// record bound to an authenticated Discord identity, never a display name.
export function verifiedFireZoneChief(actor,roster,member,guildId,now=Date.now()){
  if(!actor||actor.portalTechnicalMode===true||
     !DISCORD.test(actor.discordId)||actor.uid!=='discord:'+actor.discordId||
     !Array.isArray(actor.departments)||!actor.departments.includes('brandweer')||
     !Array.isArray(roster)||!DISCORD.test(guildId)||
     member?.guildId!==guildId||!Array.isArray(member.roleIds)||
     !member.roleIds.every(id=>DISCORD.test(id))||
     !Number.isSafeInteger(member.verifiedAt)||
     member.verifiedAt>now||now-member.verifiedAt>7*24*60*60*1000)return false;
  const owned=roster.filter(p=>p?.dept==='brandweer'&&p.personId===actor.discordId);
  return owned.length===1&&matchesDuty(owned[0],ZONE);
}

export function deriveServiceDossierDepartments(actor,personnel,member,boardAppointment,guildId,now=Date.now(),includeBoard=true){
  if(!actor||!DISCORD.test(actor.discordId)||!Array.isArray(actor.departments))return [];
  if(actor.portalTechnicalMode===true)return [...SERVICE_DOSSIER_DEPARTMENTS];
  const roles=verifiedRoles(member,guildId,now);
  // Bestuur is an independently approved appointment OR an independently
  // verified Bestuur Discord role. Neither changes operational rank.
  if(includeBoard&&(activeBoardAppointment(boardAppointment)||roles.has(DISCORD_BOARD_ROLE)))
    return [...SERVICE_DOSSIER_DEPARTMENTS];
  const allowed=[];
  if(actor.departments.includes('politie')&&
      ['middenkader','officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie')))
    allowed.push('politie');
  // Only one unambiguous roster entry for the SAME authenticated Discord ID.
  // A user's radio nickname, UI request or unrelated department role is not proof.
  const roster=Array.isArray(personnel)?personnel:[];
  for(const dept of ['ambulance','brandweer','depannage']){
    if(!actor.departments.includes(dept))continue;
    const owned=roster.filter(p=>p?.dept===dept&&p.personId===actor.discordId);
    if(owned.length!==1)continue;
    const person=owned[0];
    if(dept==='ambulance'&&(matchesDuty(person,AMBULANCE)||
       actor.uid==='discord:'+actor.discordId&&roles.has(DISCORD_AZLS_ROLE)))allowed.push(dept);
    if(dept==='brandweer'&&(matchesDuty(person,ZONE)||
       ['middle','leadership'].includes(actor.fireAccessLevel)))allowed.push(dept);
    if(dept==='depannage'&&(matchesDuty(person,AWV)||roles.has(DISCORD_AWV_ROLE)))allowed.push(dept);
  }
  return allowed;
}
export function canReadServiceDossier(actor,dept){
  if(!SERVICE_DOSSIER_DEPARTMENTS.includes(dept)||
     !Array.isArray(actor?.dossierAllowedDepartments)||
     !actor.dossierAllowedDepartments.includes(dept))return false;
  // A regular police Basiskader account may SUBMIT observations against a
  // lower police grade, but must never READ personnel observations/dossiers.
  // Even a historical or accidentally delegated 'full' dossier grant cannot
  // override this boundary. Independently verified Board/technical accounts
  // retain their separate administrative privileges.
  if(dept==='politie'&&['agentenkader','basiskader'].includes(roleForDepartment(actor,'politie'))&&
     actor?.boardPersonnelAdmin!==true&&
     !(actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true&&
       actor?.uid==='discord:'+actor?.discordId&&DISCORD.test(actor?.discordId)))
    return false;
  return true;
}

/**
 * Cross-service CORPS observation is separate from operational dossier
 * authorization. This function MUST only be used by read-only endpoints.
 * Keeping canReadServiceDossier unchanged protects every existing write path.
 */
export function canInspectServiceDossier(actor,dept){
  return Boolean(SERVICE_DOSSIER_DEPARTMENTS.includes(dept)&&
    (canReadServiceDossier(actor,dept)||isVerifiedReportCorpsReader(actor)));
}

/** Server-only proof of medical and towing leadership for reading reports.
 * Do not derive this from Police cadre, an unverified display label, or an
 * inherited dossier grant. The member role snapshot is guild-bound and fresh.
 */
export function verifiedServiceReportRoles(actor,member,guildId,now=Date.now()){
  const empty={ambulanceAzls:false,depannageAwv:false};
  if(!actor||!DISCORD.test(actor.discordId)||actor.uid!=='discord:'+actor.discordId||
     !Array.isArray(actor.departments)||actor.portalTechnicalMode===true)return empty;
  const roles=verifiedRoles(member,guildId,now);
  return {
    ambulanceAzls:actor.departments.includes('ambulance')&&roles.has(DISCORD_AZLS_ROLE),
    depannageAwv:actor.departments.includes('depannage')&&roles.has(DISCORD_AWV_ROLE)
  };
}

// Display-only classification of a Depannage colleague. The Discord guild,
// freshness and known role IDs are checked server-side. This NEVER grants
// leadership permissions, operational training or management privileges.
export function verifiedDepannageDisplayFunction(member,guildId,now=Date.now()){
  // Personnel-list labels may use a recent, guild-bound role snapshot for up
  // to 30 days, whereas *every permission check* remains limited to 15 min.
  // This function must never be used to grant dossier or operational rights.
  if(!member||typeof guildId!=='string'||!DISCORD.test(guildId)||
     member.guildId!==guildId||!Number.isSafeInteger(member.verifiedAt)||
     member.verifiedAt>now||now-member.verifiedAt>30*24*60*60*1000||
     !Array.isArray(member.roleIds)||!member.roleIds.every(id=>DISCORD.test(id)))
    return null;
  const roles=new Set(member.roleIds);
  if(roles.has(DISCORD_AWV_ROLE))return 'leiding';
  if(roles.has(DISCORD_FAST_ROLE))return 'fast';
  if(roles.has(DISCORD_LSRA_ROLE))return 'lsra';
  return null;
}
