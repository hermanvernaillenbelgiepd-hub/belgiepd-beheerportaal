import {roleForDepartment} from './leave-policy.js';
// Dashboard management navigation: presentation capability, not an API grant.
// This is a verified operational ZONE capability, set by the protected
// dossier middleware. The global account rank alone is never evidence of
// Police command, and an independent Board/technical profile stays separate.
export function isFireZoneDashboard(actor){
  if(!actor||actor.fireZoneChief!==true||!actor.departments?.includes('brandweer')||
      actor.boardPersonnelAdmin===true||actor.portalTechnicalMode===true||
      actor.role==='beheerder')return false;
  return !['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'));
}

// Management endpoints apply their own authenticated authorization checks.
const HIGHER=new Set(['officierenkader','korpsleiding']);
export function canSeeDashboardManagement(actor){
  if(!actor||typeof actor!=='object')return false;
  if(isFireZoneDashboard(actor))return false;
  if(actor.role==='beheerder'||actor.boardPersonnelAdmin===true||
    actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true)return true;
  if(HIGHER.has(actor.role))return true;
  return Object.values(actor.departmentRoles||{}).some(role=>HIGHER.has(role));
}

// Daily-work dashboard is different from managing roles: Middenkader may
// access cadre workspaces, but Agenten-/Basiskader receive only self-service.
const OPERATIONAL_MANAGEMENT=new Set(['middenkader','officierenkader','korpsleiding']);
export function canSeeAdvancedDashboard(actor){
 if(!actor||typeof actor!=='object')return false;
 if(actor.role==='beheerder'||actor.boardPersonnelAdmin===true||
   actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true)return true;
 if(OPERATIONAL_MANAGEMENT.has(actor.role))return true;
 return Object.values(actor.departmentRoles||{})
   .some(role=>OPERATIONAL_MANAGEMENT.has(role));
}
