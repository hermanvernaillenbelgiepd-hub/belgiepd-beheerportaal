// Only the dropdown of GENERAL Police trainers is constrained.
// This does NOT provide instruction, role or dossier authority.
import {policeOperationalTier} from '../public/police-roster-cadre.js';
const CADRES=new Set(['middenkader','officierenkader','korpsleiding']);
export function eligibleGeneralTrainingInstructor(person){
 if(!person||typeof person!=='object')return false;
 if(person.dept!=='politie')return true;
 return CADRES.has(policeOperationalTier(person));
}
