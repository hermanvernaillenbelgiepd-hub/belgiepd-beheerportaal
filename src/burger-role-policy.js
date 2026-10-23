import {roleForDepartment} from './leave-policy.js';

// Burger en Burger IO zijn administratief één discipline: Burger.
// Beide opgegeven benamingen verwijzen naar dezelfde Discord-rol.
// Alleen Burgerraad verleent leidinggevende Burgerdossierrechten.
export const BURGER_ROLE_IDS=Object.freeze({
  member:'1557804276250845185',
  council:'1492485336197234728'
});
export const BURGER_PERSONNEL_COLLECTION='bpd_burger_personnel';
const ID=/^\d{15,22}$/;
export function confirmedMemberRoles(member,guildId,now=Date.now()){
  if(!ID.test(guildId)||member?.guildId!==guildId||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
     now-member.verifiedAt>15*60*1000||
     !Array.isArray(member.roleIds)||!member.roleIds.every(role=>ID.test(role)))
    return new Set();
  return new Set(member.roleIds);
}
export function burgerSubjectCategory(member,guildId,now=Date.now()){
  // Burger en Burger IO vallen in dezelfde categorie zonder extra bevoegdheden.
  const roles=confirmedMemberRoles(member,guildId,now);
  return roles.has(BURGER_ROLE_IDS.member)?'burger':null;
}
export function burgerDossierScope(actor,member,guildId,now=Date.now()){
  const roles=confirmedMemberRoles(member,guildId,now);
  const identity=ID.test(actor?.discordId)&&actor?.uid==='discord:'+actor.discordId;
  const council=Boolean(identity&&roles.has(BURGER_ROLE_IDS.council));
  const policeChief=Boolean(identity&&actor?.departments?.includes('politie')&&
    roleForDepartment(actor,'politie')==='korpsleiding'&&
    actor.role==='korpsleiding');
  const board=actor?.boardPersonnelAdmin===true;
  return {read:board||council||policeChief,write:council||policeChief,
    council,policeChief,boardReadOnly:board&&!council&&!policeChief};
}
