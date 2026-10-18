import { isDiscordId } from './discord-utils.js';
import { SERVICE_DEPTS,roleSummary,isInstructorForDept } from './role-catalog.js';

// No authorization to administer rights can ever be assigned via overrides.
export const DELEGATABLE_PERMISSIONS=Object.freeze(['training.log','training.review']);
const MAX_ROLE_AGE_MS=15*60*1000;
export function recentDiscordMember(member,guildId,now=Date.now()){
  return Boolean(member && member.guildId===guildId && Number.isSafeInteger(member.verifiedAt) &&
    member.verifiedAt<=now && now-member.verifiedAt<=MAX_ROLE_AGE_MS &&
    Array.isArray(member.roleIds) && member.roleIds.every(isDiscordId));
}
export function basePermissions(member,guildId,now=Date.now()){
  const fresh=recentDiscordMember(member,guildId,now);
  const summary=roleSummary(fresh?member.roleIds:[]);
  const permissions={};
  for(const dept of SERVICE_DEPTS){
    const memberOfDept=summary.departments.includes(dept);
    permissions[dept]={
      'training.log':memberOfDept && isInstructorForDept(summary.roles,dept),
      'training.review':false
    };
  }
  return {fresh,...summary,permissions};
}
export function effectivePermissions(base,overrideDoc,now=Date.now()){
  const result=Object.fromEntries(SERVICE_DEPTS.map(dept=>[dept,{...base.permissions[dept]}]));
  for(const [dept,rules] of Object.entries(overrideDoc?.departments||{})){
    if(!SERVICE_DEPTS.includes(dept)||!rules||typeof rules!=='object')continue;
    for(const perm of DELEGATABLE_PERMISSIONS){
      const rule=rules[perm];
      if(!rule || !['allow','deny'].includes(rule.action))continue;
      if(rule.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(rule.expiresOn) || rule.expiresOn<new Date(now).toISOString().slice(0,10)))continue;
      // Overrides are effective only while a Discord guild membership is freshly verified.
      if(base.fresh && base.departments.includes(dept)) result[dept][perm]=rule.action==='allow';
    }
  }
  return result;
}
export function validateOverride(value){
  const dept=String(value?.department||'');
  const permission=String(value?.permission||'');
  const action=String(value?.action||'');
  const reason=String(value?.reason||'').trim();
  const expiresOn=String(value?.expiresOn||'').trim();
  if(!SERVICE_DEPTS.includes(dept))throw new Error('Ongeldige dienst');
  if(!DELEGATABLE_PERMISSIONS.includes(permission))throw new Error('Niet-delegeerbaar recht');
  if(!['allow','deny','inherit'].includes(action))throw new Error('Ongeldige wijziging');
  if(reason.length<8||reason.length>500)throw new Error('Reden is verplicht (8-500 tekens)');
  if(expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || new Date(expiresOn+'T12:00:00Z').toISOString().slice(0,10)!==expiresOn || expiresOn<new Date().toISOString().slice(0,10)))throw new Error('Ongeldige vervaldatum');
  return {department:dept,permission,action,reason,expiresOn:expiresOn||null};
}
export function canAdministerRoles(bpd,dept){
  return Boolean(bpd && ['officierenkader','korpsleiding'].includes(bpd.role) &&
    Array.isArray(bpd.departments) && (bpd.departments.includes(dept) || bpd.departments.includes('politie')));
}
export function canLogTraining(bpd,dept,perms){
  if(!SERVICE_DEPTS.includes(dept))return false;
  if(bpd?.provider==='google' && ['officierenkader','korpsleiding'].includes(bpd.role) && bpd.departments.includes(dept))return true;
  return Boolean(perms?.[dept]?.['training.log']);
}
export function canReviewTraining(bpd,dept,perms){
  return canAdministerRoles(bpd,dept)||Boolean(perms?.[dept]?.['training.review']);
}

// For display, use precisely the same permissions as the protected API endpoints.
export function visibleTrainingPermissions(bpd,perms){
  return Object.fromEntries(SERVICE_DEPTS.map(dept=>[dept,{
    'training.log':canLogTraining(bpd,dept,perms),
    'training.review':canReviewTraining(bpd,dept,perms)
  }]));
}
