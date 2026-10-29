// Display-only DISP specialization levels; never grants Discord or dossier rights.
export const DISP_DISPLAY_COLLECTION='bpd_organogram_disp_display_roles';
export const DISP_DISPLAY_ROLES=Object.freeze(['','in_opleiding','volwaardig','instructeur']);
export const DISP_ROLE_IDS=Object.freeze({
 instructeur:'1393050971604516904',
 volwaardig:'1309532438019706963',
 in_opleiding:'1337852029611016233'
});
const ID=/^\d{15,22}$/;
export function dispRoleFromRoleIds(roleIds){
 if(!Array.isArray(roleIds)||roleIds.some(id=>!ID.test(String(id))))return '';
 const roles=new Set(roleIds);
 // Instructors often retain full membership; full members may retain selection.
 if(roles.has(DISP_ROLE_IDS.instructeur))return 'instructeur';
 if(roles.has(DISP_ROLE_IDS.volwaardig))return 'volwaardig';
 if(roles.has(DISP_ROLE_IDS.in_opleiding))return 'in_opleiding';
 return '';
}
export function verifiedDispDisplayRole(identity,guildId,now=Date.now()){
 if(!identity||!ID.test(String(guildId||''))||identity.guildId!==guildId||
  !Array.isArray(identity.roleIds)||identity.roleIds.some(id=>!ID.test(String(id)))||
  !Number.isSafeInteger(identity.verifiedAt)||identity.verifiedAt>now+60000||
  now-identity.verifiedAt>7*86400000)return '';
 return dispRoleFromRoleIds(identity.roleIds);
}
export function effectiveDispDisplayRole(manual,automatic){
 return DISP_DISPLAY_ROLES.includes(manual)&&manual?manual:
  DISP_DISPLAY_ROLES.includes(automatic)?automatic:'';
}
