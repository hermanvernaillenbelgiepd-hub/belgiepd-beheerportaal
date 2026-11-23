import {roleForDepartment} from './leave-policy.js';
import {canViewPersonnel} from './personnel-editor-policy.js';
import {canInspectServiceDossier} from './service-dossier-access.js';
import {mayReadFortnightReport} from './fortnight-report-policy.js';
import {canReadBoard} from './to-board-policy.js';

const DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
const EMPTY=Object.freeze({activity:false,dossiers:false,reports:false,to:false});
const id=/^\d{15,22}$/;

// A DISPLAY-ONLY capability summary for the shared sidebar.
// Never accept these booleans in a protected API as evidence of a grant.
// Each underlying API repeats the current service-specific authorization.
export function portalNavigationCapabilities(actor,roster=[]){
 if(!actor||typeof actor!=='object'||!Array.isArray(actor.departments))
   return {...EMPTY};
 const technical=actor.portalTechnicalMode===true&&
   actor.profileTechnicalAvailable===true&&actor.role==='beheerder'&&
   id.test(String(actor.discordId||''))&&actor.uid==='discord:'+actor.discordId;
 const source=Array.isArray(roster)?roster:[];
 const police=roleForDepartment(actor,'politie');
 const policeCadre=['middenkader','officierenkader','korpsleiding'].includes(police);
 // Basic-cadre Police may read TO directly under a separate TO policy.
 // In navigation, only a higher Police cadre or EXPLICIT TO grant displays
 // it: normal Police Basiskader sees just the multidisciplinary calendar.
 const explicitTO=['read','operate'].includes(actor.toAccessLevel);
 return {
   activity:technical||DEPARTMENTS.some(dept=>canViewPersonnel(actor,dept)),
   dossiers:technical||DEPARTMENTS.some(dept=>canInspectServiceDossier(actor,dept)),
   reports:technical||DEPARTMENTS.some(dept=>mayReadFortnightReport(actor,dept,source)),
   to:(policeCadre||explicitTO)&&canReadBoard(actor)
 };
}
