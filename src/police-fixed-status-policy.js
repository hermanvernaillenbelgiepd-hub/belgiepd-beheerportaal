import {isFixedPoliceAgent} from './police-series-policy.js';
// A verified fixed call activates a new employee ONCE. Subsequent manual
// statuses (50/50, Inactief, Verlof) are not inferred or overwritten by calls.
const ID=/^\d{15,22}$/;
export function fixedPoliceStartStatus(person,{linked=false}={}){
 if(linked&&ID.test(String(person?.discordId||person?.personId||''))&&
  isFixedPoliceAgent(person))return 'Actief';
 return 'In opleiding';
}
export function activateOnFixedCallLink(person){
 const current=String(person?.status||'In opleiding');
 if(!isFixedPoliceAgent(person))return current;
 return current==='In opleiding'?'Actief':current;
}
