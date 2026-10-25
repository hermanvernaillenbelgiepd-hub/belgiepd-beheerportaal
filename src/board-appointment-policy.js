import {roleForDepartment} from './leave-policy.js';
import {isVerifiedTechnicalRoleApprover} from './manual-role-decision-policy.js';

// Governance is an appointment alongside the operational role. These
// capabilities affect ONLY this board registry; they are never portal roles.
export const BOARD_COLLECTION='bpd_board_appointments';
export const BOARD_PERMISSIONS=Object.freeze(['board_registry_read','board_nomination_propose']);
const DISCORD=/^\d{15,22}$/;
const STATUS=new Set(['pending','approved','rejected','revoked']);
export function boardEnabled(env){return env.BPD_ENABLE_BOARD_APPOINTMENTS==='true'}
export function boardWritesEnabled(env){return boardEnabled(env)&&env.BPD_ENABLE_BOARD_APPOINTMENT_WRITES==='true'}
export function validBoardId(value){return typeof value==='string'&&DISCORD.test(value)}
export function isTechnicalBoardApprover(actor){return actor?.role==='beheerder'&&validBoardId(actor?.discordId)}
export function activeBoardAppointment(data){
  return data?.status==='approved'&&Array.isArray(data.permissions)&&
    data.permissions.every(p=>BOARD_PERMISSIONS.includes(p))&&
    new Set(data.permissions).size===data.permissions.length;
}
export function hasBoardPermission(data,permission){
  return activeBoardAppointment(data)&&BOARD_PERMISSIONS.includes(permission)&&
    data.permissions.includes(permission);
}
export function mayNominateForBoard(actor,ownAppointment){
  if(!validBoardId(actor?.discordId))return false;
  if(isTechnicalBoardApprover(actor))return true;
  const hasCadre=Array.isArray(actor?.departments)&&actor.departments.some(
    d=>roleForDepartment(actor,d)==='korpsleiding');
  return Boolean(hasCadre||hasBoardPermission(ownAppointment,'board_nomination_propose'));
}
// A signed, owner-allowlisted technical session may review a nomination
// it submitted for somebody ELSE. This never permits self-appointment, and
// ordinary board approvers still require an independent nominator.
export function boardDecisionMethod(actor,targetId,nomination){
  if(!isTechnicalBoardApprover(actor)||!validBoardId(targetId)||
     actor?.discordId===targetId||actor?.uid==='discord:'+targetId||
     !nomination||nomination.status!=='pending')return null;
  const sameNominator=actor.uid===nomination.requestedByUid||
    actor.discordId===nomination.requestedByDiscordId;
  if(!sameNominator)return 'independent';
  return isVerifiedTechnicalRoleApprover(actor)?
    'verified_technical_single_approver':null;
}
export function mayDecideBoard(actor,targetId,nomination){
  return boardDecisionMethod(actor,targetId,nomination)!==null;
}
function cleanReason(value){
  if(typeof value!=='string'||value.trim().length<15||value.trim().length>500)
    throw Error('Geef een motivering van 15 tot 500 tekens');
  const result=value.trim();
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/.test(result))throw Error('Ongeldige tekens in de motivering');
  return result;
}
export function validateBoardNomination(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['discordId','permissions','reason'].includes(key)))
    throw Error('Ongeldige bestuursvoordracht');
  if(!validBoardId(body.discordId))throw Error('Ongeldige Discord-ID');
  const permissions=body.permissions;
  if(!Array.isArray(permissions)||permissions.length>BOARD_PERMISSIONS.length||
    permissions.some(p=>!BOARD_PERMISSIONS.includes(p))||
    new Set(permissions).size!==permissions.length)
    throw Error('Ongeldige of dubbele bestuursbevoegdheden');
  return {discordId:body.discordId,permissions:[...permissions],reason:cleanReason(body.reason)};
}
export function validateBoardDecision(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['decision','reason'].includes(key))||
    !['approved','rejected'].includes(body.decision))
    throw Error('Ongeldige bestuursbeslissing');
  return {decision:body.decision,reason:cleanReason(body.reason)};
}
export function validateBoardRevocation(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>key!=='reason'))
    throw Error('Ongeldige intrekking');
  return {reason:cleanReason(body.reason)};
}
export function serializeBoardAppointment(id,data){
  if(!validBoardId(id)||!data||!STATUS.has(data.status))return null;
  const requested=Array.isArray(data.requestedPermissions)?
    data.requestedPermissions.filter(x=>BOARD_PERMISSIONS.includes(x)):[];
  return {discordId:id,name:typeof data.username==='string'?data.username.slice(0,80):'',
    title:'Bestuur',status:data.status,
    permissions:activeBoardAppointment(data)?[...data.permissions]:[],
    requestedPermissions:requested,
    proposedAt:data.proposedAt?.toDate?.()?.toISOString?.()||null,
    decidedAt:data.decidedAt?.toDate?.()?.toISOString?.()||null,
    revokedAt:data.revokedAt?.toDate?.()?.toISOString?.()||null};
}
