// Server-side lifecycle permissions. Guild display snapshots are never grants.
import {roleForDepartment} from './leave-policy.js';
import {LIFECYCLE_SERVICES} from './personnel-lifecycle-policy.js';
import {canViewPersonnel,canEditPersonnel,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
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
