import {roleForDepartment} from './leave-policy.js';
import {activeBoardAppointment} from './board-appointment-policy.js';

export const SERVICE_DOSSIER_DEPARTMENTS=Object.freeze(['politie','ambulance','brandweer','depannage']);
const DISCORD=/^\d{15,22}$/;
const DISCORD_BOARD_ROLE='1309532438082355251';
const DISCORD_AWV_ROLE='1309532438019706969';
// A role snapshot is evidence only when fetched for the authenticated guild member.
// This module never accepts a display name, a radio label or a client-side claim.
const verifiedRoles=(member,guildId,now)=>{
  if(!member||typeof guildId!=='string'||!DISCORD.test(guildId)||
     member.guildId!==guildId||!Number.isSafeInteger(member.verifiedAt)||
     member.verifiedAt>now||now-member.verifiedAt>15*60*1000||
     !Array.isArray(member.roleIds)||!member.roleIds.every(x=>DISCORD.test(x)))return new Set();
  return new Set(member.roleIds);
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
    if(dept==='ambulance'&&matchesDuty(person,AMBULANCE))allowed.push(dept);
    if(dept==='brandweer'&&(matchesDuty(person,ZONE)||
       ['middle','leadership'].includes(actor.fireAccessLevel)))allowed.push(dept);
    if(dept==='depannage'&&(matchesDuty(person,AWV)||roles.has(DISCORD_AWV_ROLE)))allowed.push(dept);
  }
  return allowed;
}
export function canReadServiceDossier(actor,dept){
  return SERVICE_DOSSIER_DEPARTMENTS.includes(dept)&&
    Array.isArray(actor?.dossierAllowedDepartments)&&actor.dossierAllowedDepartments.includes(dept);
}
