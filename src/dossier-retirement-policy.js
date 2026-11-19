// Dossier retirement is a correction with permanent traceability, never a
// Firestore delete. The role must be server-confirmed for the target department.
import {canEditPersonnel,canReadPersonnelSubject} from './personnel-editor-policy.js';
export const RETIRABLE_KINDS=Object.freeze(['notitie','algemene_notitie','inactiviteitsping',
 'specialisatiebeperking','observatie','sanctie','basisnotitie','oude_basisnotitie']);
export const RETIRABLE_SOURCES=Object.freeze(['cases','staff']);
export function canRetireDossierRecord(actor,subject){
 return Boolean(subject&&actor?.discordId!==subject.personId&&
   canReadPersonnelSubject(actor,subject)&&canEditPersonnel(actor,subject)&&
   (actor.portalTechnicalMode!==true||
     actor.profileTechnicalAvailable===true&&actor.uid==='discord:'+actor.discordId));
}
export function mayRetireCaseType(entry){
 // System-generated activity alerts and central leave audit entries must
 // never be erased from the active dossier by routine duplicate cleanup.
 return entry?.source!=='central-leave-audit'&&
   entry?.source!=='automatic_fivem_activity'&&
   ['notitie','algemene_notitie','inactiviteitsping',
    'specialisatiebeperking','observatie','sanctie','basisnotitie'].includes(entry?.type);
}
export function retirementReason(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>k!=='reason'))throw Error('Ongeldige wisaanvraag');
 const reason=body.reason;
 if(typeof reason!=='string'||reason.trim().length<10||reason.trim().length>500)
   throw Error('Geef een motivering van 10 tot 500 tekens');
 return reason.trim();
}
export function isRetired(data){
 return data?.status==='verwijderd'||data?.retired?.at!=null;
}
