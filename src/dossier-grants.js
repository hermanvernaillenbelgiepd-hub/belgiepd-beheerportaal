import {roleForDepartment} from './leave-policy.js';
import {activeBoardAppointment} from './board-appointment-policy.js';
export const DOSSIER_GRANT_COLLECTION='bpd_dossier_delegations';
export const DOSSIER_GRANT_AUDIT='bpd_dossier_delegations_audit';
export const DOSSIER_DEPTS=Object.freeze(['politie','ambulance','brandweer','depannage']);
const ID=/^\d{15,22}$/;
const BOARD_ROLE='1309532438082355251';
export const dossierGrantKey=(dept,id)=>dept+'_'+id;
export const activeDossierGrant=(data,dept,id)=>Boolean(DOSSIER_DEPTS.includes(dept)&&ID.test(id)&&
  data?.status==='active'&&data.discordId===id&&data.dept===dept&&
  ['read','manage'].includes(data.level));

export function dossierGrantScope(actor,boardMember,boardAppointment,dept){
  const technical=actor?.role==='beheerder';
  const board=activeBoardAppointment(boardAppointment)||boardMember===true;
  if(technical||board)return DOSSIER_DEPTS.includes(dept);
  // Operational corps leadership can delegate only within its own police service.
  return dept==='politie'&&roleForDepartment(actor,'politie')==='korpsleiding';
}
export function dossierGrantIsAdmin(actor,boardMember,boardAppointment){
  return DOSSIER_DEPTS.some(d=>dossierGrantScope(actor,boardMember,boardAppointment,d));
}
export function dossierGrantPayload(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['discordId','dept','level','reason'].includes(k)))
    throw new Error('Ongeldige aanvraag');
  const discordId=String(body.discordId||'');
  const dept=body.dept,level=body.level;
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(!ID.test(discordId)||!DOSSIER_DEPTS.includes(dept)||!['read','manage'].includes(level))
    throw new Error('Kies een bestaande Discord-gebruiker, hulpdienst en toegangsniveau');
  if(reason.length<10||reason.length>300)throw new Error('Motivering van 10 tot 300 tekens verplicht');
  return {discordId,dept,level,reason};
}
export function dossierGrantReason(body){
  const reason=typeof body?.reason==='string'?body.reason.trim():'';
  if(reason.length<10||reason.length>300)throw new Error('Motivering van 10 tot 300 tekens verplicht');
  return reason;
}
export function applyDossierGrants(actor,defaults,docs=[],tester=null){
  const id=actor?.discordId;
  const result=new Set(defaults||[]);
  if(!ID.test(id))return {departments:[...result],manageDepartments:[],tester:false};
  const tested=process.env.FIREBASE_PROJECT_ID==='belgiepd-test'&&
    tester?.status==='active'&&tester?.discordId===id&&tester?.level==='all-read';
  if(tested)for(const d of DOSSIER_DEPTS)result.add(d);
  const manage=[];
  for(const doc of docs){
    if(!activeDossierGrant(doc,doc?.dept,id))continue;
    result.add(doc.dept);
    if(doc.level==='manage')manage.push(doc.dept);
  }
  return {departments:DOSSIER_DEPTS.filter(d=>result.has(d)),
    manageDepartments:[...new Set(manage)],tester:tested};
}
export function verifyBoardDiscordRole(member,guildId,now=Date.now()){
  return Boolean(ID.test(guildId)&&member?.guildId===guildId&&
    Number.isSafeInteger(member.verifiedAt)&&member.verifiedAt<=now&&
    now-member.verifiedAt<=15*60000&&Array.isArray(member.roleIds)&&
    member.roleIds.every(x=>ID.test(x))&&member.roleIds.includes(BOARD_ROLE));
}
