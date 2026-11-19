// Active SIV/WPR vehicle restrictions tied to an explicitly mentioned course.
// READ-ONLY derivation: sanction records, qualifications and Discord roles are
// never modified by this module. Completion is accepted only after review.
export const SIV_TRAINING_RESTRICTIONS='bpd_siv_training_restrictions';
export const priorityToday=(at=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'
}).format(at);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const norm=x=>String(x||'').normalize('NFKC').toLocaleUpperCase('nl-BE')
 .replace(/[^A-Z0-9]/g,'');
export function isPriorityCourse(name){
 return norm(name)==='PRIORITAIRRIJDEN'||norm(name)==='OPLEIDINGPRIORITAIRRIJDEN';
}
export function isSivTrainingSanction(value){
 if(!value||value.type!=='sanctie'||value.sanctionType!=='Tijdelijke beperking'||
   value.testRecord===true||value.retired===true||value.retiredAt||
   value.status==='ingetrokken'||value.status==='verwijderd'||
   !DATE.test(String(value.eventDate||''))||!DATE.test(String(value.endDate||''))||
   value.endDate<value.eventDate)return false;
 const specialties=Array.isArray(value.restrictedSpecialties)?
   value.restrictedSpecialties:[];
 const siv=specialties.some(x=>/^SIV(?:WPR)?$|^WPR$/.test(norm(x)));
 if(!siv)return false;
 const description=String(value.details||'')+' '+String(value.explanation||'');
 // A generic SIV ban is NOT automatically a priority-driving course
 // obligation: only sanctions explicitly referring to training are linked.
 return /\bopleiding\b|\bbijscholing\b|\bprioritair(?:\s|-)rijden\b/i
   .test(description)||isPriorityCourse(value.requiredTrainingCourse);
}
export function passedPriorityDriving(record,issuedAt,today=priorityToday()){
 return record?.result==='geslaagd'&&
   record.rosterStatus==='klaar_voor_manuele_invoer'&&
   record.testRecord!==true&&record.status!=='verwijderd'&&
   record.deletedAt==null&&isPriorityCourse(record.courseName)&&
   DATE.test(String(record.eventDate||''))&&record.eventDate>=issuedAt&&
   record.eventDate<=today;
}
export function sivRestrictionStatus(sanction,trainings=[],today=priorityToday()){
 if(!isSivTrainingSanction(sanction))return {state:'niet_toepasbaar',releaseDate:null};
 // A temporary restriction expires after its *last* valid day, not at the
 // beginning of that day. Historic source records remain immutable.
 if(sanction.endDate<today)return {state:'verlopen',releaseDate:sanction.endDate};
 const passed=Array.isArray(trainings)?trainings.filter(x=>
   passedPriorityDriving(x,sanction.eventDate,today)).sort((a,b)=>
   String(a.eventDate).localeCompare(String(b.eventDate)))[0]:null;
 if(passed)return {state:'voltooid',releaseDate:passed.eventDate};
 return {state:'actief',releaseDate:null};
}
export const SIV_RESTRICTION_LABEL='SIV/WPR · rijverbod tot Prioritair rijden of einde termijn';
export const sivRestrictionItem=(sanction,id,personId,state)=>({
 id,subjectDiscordId:personId,
 courseName:'PRIORITAIR RIJDEN',label:'SIV/WPR · rijbeperking',
 fromDate:sanction.eventDate,toDate:sanction.endDate,state
});
