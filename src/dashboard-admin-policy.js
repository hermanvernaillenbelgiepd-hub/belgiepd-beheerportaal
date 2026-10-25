// Dashboard management navigation: presentation capability, not an API grant.
// Management endpoints apply their own authenticated authorization checks.
const HIGHER=new Set(['officierenkader','korpsleiding']);
export function canSeeDashboardManagement(actor){
  if(!actor||typeof actor!=='object')return false;
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
