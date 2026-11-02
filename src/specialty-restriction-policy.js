// Per-personnel, per-service temporary specialization restrictions.
// Display restrictions never remove a qualification or modify Discord access.
import {validDate,mayWriteManagement} from './management-utils.js';
import {allSpecialtyLabels} from './specialization-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';

export const SPECIALTY_RESTRICTION_COLLECTION='bpd_specialty_restrictions';
export const restrictionToday=(now=new Date())=>
 new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function canRestrictSpecialty(actor,person){
 return Boolean(person&&actor?.uid==='discord:'+actor.discordId&&
  actor.discordId!==person.personId&&
  actor.dossierNativeDepartments?.includes(person.dept)&&
  canReadServiceDossier(actor,person.dept)&&
  mayWriteManagement(actor,person.dept,'specialisatiebeperking'));
}
export function restrictionStatus(entry,today=restrictionToday()){
 if(entry?.status==='lifted')return 'ingetrokken';
 if(entry?.status!=='active')return 'onbekend';
 if(entry.endDate<today)return 'verlopen';
 if(entry.startDate>today)return 'gepland';
 return 'actief';
}
const RESTRICTION_ID=/^[A-Za-z0-9_-]{8,64}$/;
export function safeRestrictionEntry(entry,id,today=restrictionToday()){
 if(!entry||!RESTRICTION_ID.test(id)||typeof entry.label!=='string'||
  !validDate(entry.startDate)||!validDate(entry.endDate)||
  entry.endDate<entry.startDate||!['active','lifted'].includes(entry.status))
  return null;
 return {id,label:entry.label.slice(0,90),startDate:entry.startDate,
  endDate:entry.endDate,status:restrictionStatus(entry,today),
  reason:String(entry.reason||'').slice(0,500),
  changedBy:/^\d{15,22}$/.test(entry.changedBy||'')?entry.changedBy:null,
  closedBy:/^\d{15,22}$/.test(entry.closedBy||'')?entry.closedBy:null};
}
export function validateRestrictionAction(body,dept,extra=[],today=restrictionToday()){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['action','label','startDate','endDate','reason','expectedRevision'].includes(k)))
  throw Error('Ongeldige tijdelijke beperking');
 const action=body.action,label=body.label;
 if(!['restrict','lift'].includes(action))throw Error('Ongeldige beperkingsactie');
 if(typeof label!=='string'||!allSpecialtyLabels(dept,extra).includes(label))
  throw Error('Kies een bestaande specialisatie van de dienst');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw Error('Vernieuw de beperkingen voor een nieuwe wijziging');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<15||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering verplicht (15–500 tekens)');
 if(action==='lift')return {action,label,reason,expectedRevision:body.expectedRevision};
 const startDate=body.startDate,endDate=body.endDate;
 if(!validDate(startDate)||!validDate(endDate)||endDate<startDate)
  throw Error('Kies een geldige begin- en einddatum');
 const length=(Date.parse(endDate+'T12:00:00Z')-Date.parse(startDate+'T12:00:00Z'))/86400000;
 if(length>365)throw Error('De termijn mag maximaal één jaar zijn');
 if(endDate<today)throw Error('Een reeds verlopen maatregel kan niet geactiveerd worden');
 return {action,label,startDate,endDate,reason,expectedRevision:body.expectedRevision};
}
