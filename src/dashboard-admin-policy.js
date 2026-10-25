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
