// Server-side lifecycle permissions. Guild display snapshots are never grants.
import {roleForDepartment} from './leave-policy.js';
import {LIFECYCLE_SERVICES} from './personnel-lifecycle-policy.js';
import {canViewPersonnel,canEditPersonnel,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {verifiedPoliceRankAuthority} from './personnel-rank-policy.js';
const ID=/^\d{15,22}$/;
const HIGH=new Set(['officierenkader','korpsleiding']);
const technical=a=>Boolean(a?.portalTechnicalMode===true&&a?.profileTechnicalAvailable===true&&
 ID.test(String(a?.discordId||''))&&a.uid==='discord:'+a.discordId);
export function canManageLifecycleDepartment(actor,dept){
 if(!actor||!LIFECYCLE_SERVICES.includes(dept))return false;
 if(technical(actor))return true;
 if(!ID.test(String(actor.discordId||''))||actor.uid!=='discord:'+actor.discordId||
  !actor.departments?.includes(dept))return false;
 const scoped=roleForDepartment(actor,dept);
 if(dept==='burger')return HIGH.has(actor.role)&&HIGH.has(scoped);
 if(!canViewPersonnel(actor,dept)||!canReadServiceDossier(actor,dept)||
  !actor.dossierNativeDepartments?.includes(dept))return false;
 if(dept==='brandweer'&&actor.fireZoneChief===true)return true;
 return HIGH.has(actor.role)&&HIGH.has(scoped);
}
export function canReadPersonnelLifecycle(actor,person){
 if(!person||!canManageLifecycleDepartment(actor,person.dept))return false;
 // Burger dossiers remain retired; only membership and archive are accessible.
 return person.dept==='burger'||canReadPersonnelSubject(actor,person);
}
export function canManagePersonnelLifecycle(actor,person){
 return Boolean(person&&ID.test(String(person.personId||''))&&
  actor?.discordId!==person.personId&&canReadPersonnelLifecycle(actor,person)&&
  (person.dept==='burger'||canEditPersonnel(actor,person)));
}

// FULL-SERVICE removal is a separate, Police-owned decision. A manager
// of Brandweer, AZLS, Depannage or Burger may never trigger it by selecting
// an ordinary service archive. Technical access alone is not a permission.
export function canGloballyArchivePersonnel(actor,subject){
 return Boolean(subject&&LIFECYCLE_SERVICES.includes(subject.dept)&&
   ID.test(String(subject.personId||''))&&actor?.discordId!==subject.personId&&
   actor?.uid==='discord:'+actor?.discordId&&
   actor?.dossierNativeDepartments?.includes('politie')&&
   actor?.dossierAllowedDepartments?.includes('politie')&&
   canReadServiceDossier(actor,'politie')&&
   ['officierenkader','korpsleiding'].includes(verifiedPoliceRankAuthority(actor)));
}
// Reentry: the local service may register a pending request, but only
// independently verified Police Officer cadre or Corps may release it.
export const canApproveServiceReentry=canGloballyArchivePersonnel;
