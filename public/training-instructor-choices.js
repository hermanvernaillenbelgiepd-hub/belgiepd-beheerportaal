// Shared registration dropdown: same personnel order as the personnel list.
// The original saved instructorName stays plain text; no role or privilege is granted.
import {DOSSIER_COLLEAGUE_SORT_MODES} from './dossier-colleague-sort.js';
export const MANUAL_INSTRUCTOR_VALUE='__manual__';
export function sortTrainingPeople(people,department,comparePersonnel){
 if(typeof comparePersonnel!=='function')throw new TypeError('Personeelsvergelijking ontbreekt');
 const mode=DOSSIER_COLLEAGUE_SORT_MODES[department]||'name-asc';
 return [...(Array.isArray(people)?people:[])].filter(p=>p&&p.department===department||p&&p.dept===department)
  .sort((a,b)=>comparePersonnel({...a,dept:department},{...b,dept:department},mode));
}
export function instructorOptionText(person){
 return (String(person?.call||'—').trim()||'—')+' · '+String(person?.name||'Onbekend').trim();
}
export function populateInstructorOptions(select,input,people,department,comparePersonnel,previous=''){
 const sorted=sortTrainingPeople(people,department,comparePersonnel);
 const options=[new Option('Kies een opleider…',''),
  ...sorted.map(p=>new Option(instructorOptionText(p),instructorOptionText(p))),
  new Option('ANDERE · opleider zelf invullen',MANUAL_INSTRUCTOR_VALUE)];
 select.replaceChildren(...options);
 const name=String(previous||'').trim();
 const match=name&&sorted.find(p=>[instructorOptionText(p),String(p.name||'').trim(),
   String(p.call||'').trim()].includes(name));
 if(match)select.value=instructorOptionText(match);
 else if(name){select.value=MANUAL_INSTRUCTOR_VALUE;input.value=name}
 else {select.value='';input.value=''}
 return sorted;
}
export function syncManualInstructor(select,input,wrapper){
 const manual=select.value===MANUAL_INSTRUCTOR_VALUE;
 wrapper.hidden=!manual;
 input.required=manual;
 if(!manual)input.value='';
 return manual;
}
export function selectedInstructor(select,input){
 return (select.value===MANUAL_INSTRUCTOR_VALUE?input.value:select.value).trim();
}
