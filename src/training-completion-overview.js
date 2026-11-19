import {isArchivedTraining} from './training-maintenance.js';
import {isRetired} from './dossier-retirement-policy.js';
import {isTrainingResult} from './training-result-policy.js';
export const COMPLETION_OVERVIEW_DEPARTMENTS=Object.freeze(
 ['politie','brandweer','ambulance','depannage']);
export const COMPLETION_OVERVIEW_BATCH=20;
export const COMPLETION_OVERVIEW_RECORD_LIMIT=100;
export const COMPLETION_OVERVIEW_CASE_LIMIT=150;

const clean=(x,n=150)=>typeof x==='string'?x.trim().slice(0,n):'';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&
 !Number.isNaN(Date.parse(value+'T12:00:00Z'))&&
 new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function completedTrainingResult(record,subject,id){
 if(!record||!isTrainingResult(record.result)||isArchivedTraining(record)||record.testRecord===true||
   record.department!==subject?.dept||
   record.subjectDiscordId!==subject.personId||
   !validDate(record.eventDate))return null;
 return {id:'training:'+id,source:'opleidingsregister',
   dept:subject.dept,discordId:subject.personId,
   name:clean(subject.name,120),call:clean(subject.call,24),
   rank:clean(subject.rank,120),courseName:clean(record.courseName),
   eventDate:record.eventDate,result:record.result,
   instructor:clean(record.instructorName,120),
   reviewStatus:clean(record.rosterStatus,80),
   details:clean(record.details,1600),
   registeredByDiscordId:clean(record.registeredByDiscordId,22),
   testRecord:record.testRecord===true};
}
export function completedTrainingAttendance(record,subject,id){
 if(!record||record.type!=='opleiding'||record.reportCategory!=='opleiding'||
   record.source==='training-manual'||!record.trainingRequestId||
   record.dept!==subject?.dept||
   record.subjectDiscordId!==subject.personId||
   isRetired(record)||record.testRecord===true||
   !validDate(record.eventDate))return null;
 return {id:'case:'+id,source:'uitgevoerde_aanvraag',
   dept:subject.dept,discordId:subject.personId,
   name:clean(subject.name,120),call:clean(subject.call,24),
   rank:clean(subject.rank,120),courseName:clean(record.courseName),
   eventDate:record.eventDate,result:'deelname_bevestigd',
   instructor:clean(record.registeredBy?.name,120),
   reviewStatus:'',details:'Deelname bevestigd. Geen slagingsresultaat vastgelegd.',
   registeredByDiscordId:clean(record.registeredBy?.discordId,22),
   testRecord:false};
}
export function completionSort(a,b){
 return String(b.eventDate||'').localeCompare(String(a.eventDate||''))||
 String(a.name||'').localeCompare(String(b.name||''),'nl')||
 String(a.id||'').localeCompare(String(b.id||''));
}
