// Centrale verlofregels. Alle bevoegdheden worden op de SERVER gecontroleerd.
export const LEAVE_ROLES=Object.freeze(['middenkader','officierenkader','korpsleiding']);
const HIGH_ROLES=new Set(['officierenkader','korpsleiding']);
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LEAVE_MAX_DAYS=730;

export function parseDay(value){
  if(typeof value!=='string'||!ISO_DATE.test(value))throw new Error('Ongeldige datum (JJJJ-MM-DD)');
  const timestamp=Date.parse(value+'T00:00:00.000Z');
  if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==value)throw new Error('Ongeldige datum');
  return timestamp;
}
export function calendarDays(start,end){
  const first=parseDay(start),last=parseDay(end);
  if(last<first)throw new Error('De einddatum ligt vóór de begindatum');
  const days=(last-first)/86400000+1;
  if(days>LEAVE_MAX_DAYS)throw new Error('Een verlofperiode mag maximaal 730 kalenderdagen bevatten');
  return days;
}
export function validDiscordId(id){return typeof id==='string'&&/^\d{15,22}$/.test(id)}
export function normalizeEmail(value){
  if(typeof value!=='string'||!ISO_EMAIL.test(value.trim())||value.trim().length>254)throw new Error('Ongeldig e-mailadres');
  return value.trim().toLowerCase();
}
export function validateLeaveRequest(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Ongeldige aanvraag');
  const startDate=raw.startDate,endDate=raw.endDate;
  const days=calendarDays(startDate,endDate);
  const note=raw.note===undefined?'':raw.note;
  if(typeof note!=='string'||note.trim().length>300)throw new Error('Toelichting mag maximaal 300 tekens bevatten');
  return {startDate,endDate,days,note:note.trim()};
}
export function activeGrant(grant,today=new Date().toISOString().slice(0,10)){
  if(!grant||grant.revoked===true||grant.permission!=='VERLOFBEHEER')return null;
  if(!['max30','all'].includes(grant.level))return null;
  try {parseDay(grant.startsOn);parseDay(grant.expiresOn)} catch {return null}
  if(grant.startsOn>today||grant.expiresOn<today||grant.expiresOn<grant.startsOn)return null;
  return grant;
}
export function sharesDepartment(actor,subjectDepartments){
  return Array.isArray(actor?.departments) && Array.isArray(subjectDepartments) &&
    actor.departments.some(dept=>subjectDepartments.includes(dept));
}
// Een delegatie is een EXTRA recht, geen algemene kaderrol. Een dienstoverstijgende
// delegatie verleent uitsluitend toegang tot centrale verlofdata, nooit dossiers.
// Gebruik de rol die binnen de gevraagde hulpdienst geldig is.
// Een algemene kaderrol mag niet automatisch op andere diensten doorwerken.
export function roleForDepartment(actor,department){
  // A verified ZONE chef is equivalent to korpsleiding ONLY inside Brandweer.
  // This never alters the global or official operational rank.
  if(department==='brandweer'&&actor?.fireZoneChief===true&&
     actor?.departments?.includes('brandweer'))return 'korpsleiding';
  if(!Array.isArray(actor?.departments)||!actor.departments.includes(department))return null;
  const map=actor.departmentRoles;
  if(map && typeof map==='object' && !Array.isArray(map) && Object.keys(map).length){
    return typeof map[department]==='string'?map[department]:null;
  }
  // Legacy: enkel bij een ondubbelzinnig lidmaatschap van precies 1 dienst.
  return actor.departments.length===1 && typeof actor.role==='string'?actor.role:null;
}
function scopedRoles(actor,subjectDepartments){
  if(!Array.isArray(subjectDepartments))return [];
  return subjectDepartments.map(dept=>roleForDepartment(actor,dept)).filter(Boolean);
}
export function mayApproveLeave(actor,request,grant,today=new Date().toISOString().slice(0,10)){
  if(!actor||!validDiscordId(actor.discordId)||!request||request.status!=='pending')return false;
  if(actor.discordId===request.personDiscordId)return false; // Nooit eigen aanvraag.
  const days=calendarDays(request.startDate,request.endDate);
  const delegated=activeGrant(grant,today);
  if(delegated)return delegated.level==='all'||days<=30;
  if(!sharesDepartment(actor,request.subjectDepartments))return false;
  const roles=scopedRoles(actor,request.subjectDepartments);
  if(roles.some(role=>HIGH_ROLES.has(role)))return true;
  return roles.includes('middenkader')&&days<=30;
}
export function highCadreDepartments(actor){
  const depts=Array.isArray(actor?.departments)?actor.departments:[];
  const map=actor?.departmentRoles||{};
  if(Object.keys(map).length)return depts.filter(d=>HIGH_ROLES.has(map[d]));
  return depts.length===1&&HIGH_ROLES.has(actor?.role)?depts:[];
}
export const LEAVE_SERVICES=Object.freeze(['politie','brandweer','ambulance','depannage']);
export function leaveGrantDepartments(actor,verifiedBoard=false){
  if(!actor||!validDiscordId(actor.discordId))return [];
  if(actor.role==='beheerder'||verifiedBoard===true)return [...LEAVE_SERVICES];
  return highCadreDepartments(actor).filter(d=>LEAVE_SERVICES.includes(d));
}
export function mayManageGrants(actor,verifiedBoard=false){
  return leaveGrantDepartments(actor,verifiedBoard).length>0;
}
export function mayReviewLeaveNotifications(actor,delegated=false){
  return Boolean(actor&&validDiscordId(actor.discordId)&&(
    delegated===true||actor.role==='beheerder'||
    (Array.isArray(actor.departments)&&actor.departments.some(d=>
      LEAVE_SERVICES.includes(d)&&LEAVE_ROLES.includes(roleForDepartment(actor,d))))));
}
export function validateGrant(raw,today=new Date().toISOString().slice(0,10)){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Ongeldige machtiging');
  const discordId=typeof raw.discordId==='string'?raw.discordId.trim():'';
  if(!validDiscordId(discordId))throw new Error('Vul een geldig Discord-ID in');
  const level=raw.level;
  if(!['max30','all'].includes(level))throw new Error('Kies maximaal 30 dagen of alle verlofduren');
  const startsOn=raw.startsOn,expiresOn=raw.expiresOn;
  const days=calendarDays(startsOn,expiresOn);
  if(startsOn<today)throw new Error('De machtiging mag niet in het verleden beginnen');
  if(days>366)throw new Error('Tijdelijke machtiging mag maximaal 366 dagen duren');
  return {discordId,level,startsOn,expiresOn,permission:'VERLOFBEHEER'};
}
