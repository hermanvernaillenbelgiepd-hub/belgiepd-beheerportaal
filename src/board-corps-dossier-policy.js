// Cross-service dossier editing is exceptional and requires TWO independent
// server-verified facts: Bestuur and operational Police Korpsleiding.
// Ordinary Board remains cross-service READ (some general metadata edits);
// ordinary Police Korpsleiding remains limited to authorised Police work.
// This flag never assigns Discord roles, portal rank, technical privileges,
// board appointments, or authority to change their own personnel file.
import {roleForDepartment} from './leave-policy.js';
const ID=/^\d{15,22}$/;
export const BOARD_CORPS_DOSSIER_DEPTS=Object.freeze([
  'politie','ambulance','brandweer','depannage'
]);
export function verifiedBoardCorpsDossierAdmin(actor){
  const id=actor?.discordId;
  return Boolean(ID.test(String(id||''))&&actor.uid==='discord:'+id&&
    actor.portalTechnicalMode!==true&&
    actor.boardPersonnelAdmin===true&&actor.dossierSourceFresh===true&&
    actor.role==='korpsleiding'&&
    actor.departments?.includes('politie')&&
    roleForDepartment(actor,'politie')==='korpsleiding'&&
    (actor.discordPoliceRank==='korpsleiding'||actor.manualCorpsApproved===true));
}
export function dossierAuthorityRole(actor,dept){
  return BOARD_CORPS_DOSSIER_DEPTS.includes(dept)&&
    verifiedBoardCorpsDossierAdmin(actor)
    ?'korpsleiding':roleForDepartment(actor,dept);
}
