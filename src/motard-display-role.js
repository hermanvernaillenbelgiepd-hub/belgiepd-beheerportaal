// MOTARD organogram display only. Never grants Discord, dossier or personnel privileges.
export const MOTARD_DISPLAY_COLLECTION='bpd_organogram_motard_display_roles';
export const MOTARD_DISPLAY_ROLES=Object.freeze(['','in_opleiding','volwaardig','instructeur']);
export const MOTARD_ROLE_IDS=Object.freeze({
 instructeur:'1359656762289946755',
 volwaardig:'1358148694297415741',
 in_opleiding:'1365602771855740958'
});
const ID=/^\d{15,22}$/;
export function motardRoleFromRoleIds(roleIds){
 if(!Array.isArray(roleIds)||roleIds.some(id=>!ID.test(String(id))))return '';
 const roles=new Set(roleIds);
 // Instructors often retain their full member role. Full supersedes trainee.
 if(roles.has(MOTARD_ROLE_IDS.instructeur))return 'instructeur';
 if(roles.has(MOTARD_ROLE_IDS.volwaardig))return 'volwaardig';
 if(roles.has(MOTARD_ROLE_IDS.in_opleiding))return 'in_opleiding';
 return '';
}
export function verifiedMotardDisplayRole(identity,guildId,now=Date.now()){
 if(!identity||!ID.test(String(guildId||''))||identity.guildId!==guildId||
  !Array.isArray(identity.roleIds)||identity.roleIds.some(id=>!ID.test(String(id)))||
  !Number.isSafeInteger(identity.verifiedAt)||identity.verifiedAt>now+60000||
  now-identity.verifiedAt>7*86400000)return '';
 return motardRoleFromRoleIds(identity.roleIds);
}
export function effectiveMotardDisplayRole(manual,automatic){
 return MOTARD_DISPLAY_ROLES.includes(manual)&&manual?manual:
  MOTARD_DISPLAY_ROLES.includes(automatic)?automatic:'';
}
