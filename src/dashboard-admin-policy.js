import {roleForDepartment} from './leave-policy.js';
// Dashboard management navigation: presentation capability, not an API grant.
// This is a verified operational ZONE capability, set by the protected
// dossier middleware. The global account rank alone is never evidence of
// Police command, and an independent Board/technical profile stays separate.
export function isFireZoneDashboard(actor){
  if(!actor||!actor.departments?.includes('brandweer')||
      actor.boardPersonnelAdmin===true||actor.portalTechnicalMode===true||
      actor.role==='beheerder')return false;
  const approvedZone=actor.role==='korpsleiding'&&
    roleForDepartment(actor,'brandweer')==='korpsleiding';
  return (actor.fireZoneChief===true||approvedZone)&&
    !['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'));
}

// AZLS service staff must not inherit generic Police/admin dashboard cards.
// Every approved service-scoped Ambulance tier (including Basiskader) receives
// the AZLS home. This is navigation only, NOT evidence of medical leadership
// or permission to open protected personnel dossiers and reports.
export function ambulanceDashboardTier(actor){
  if(!actor||actor.role==='beheerder'||actor.boardPersonnelAdmin===true||
      actor.portalTechnicalMode===true||!actor.departments?.includes('ambulance')||
      ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie')))
    return null;
  const tier=roleForDepartment(actor,'ambulance');
  const rank={basiskader:1,middenkader:2,officierenkader:3,korpsleiding:4};
  if(!rank[tier]||!rank[actor.role]||rank[tier]>rank[actor.role])return null;
  return tier;
}
// Management endpoints apply their own authenticated authorization checks.
const HIGHER=new Set(['officierenkader','korpsleiding']);
export function canSeeDashboardManagement(actor){
  if(!actor||typeof actor!=='object')return false;
  if(isFireZoneDashboard(actor))return false;
  if(ambulanceDashboardTier(actor))return false;
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
