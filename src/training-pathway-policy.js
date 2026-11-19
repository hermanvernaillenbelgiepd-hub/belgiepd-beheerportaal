import {roleForDepartment} from './leave-policy.js';
import {TRAINING_REQUEST_COURSE_CATALOG} from '../public/training-course-catalog.js';

export const PATHWAY_COLLECTION='bpd_training_pathway_courses';
export const PERSONAL_PATHWAY_COLLECTION='bpd_training_pathway_person_requirements';
export const PATHWAY_DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
const ID=/^\d{15,22}$/;
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const unsafe=v=>/[<>\x00-\x1f\x7f]/.test(v);
const isoDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&
  new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export const keyName=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('nl-BE')
  .replace(/\s+/g,' ').trim();

export function authorizedOwnDepartments(actor,roster){
 if(!actor||!ID.test(actor.discordId)||actor.uid!=='discord:'+actor.discordId||
    !Array.isArray(actor.departments))return [];
 return PATHWAY_DEPARTMENTS.filter(dept=>actor.departments.includes(dept)&&
  roster.filter(p=>p.dept===dept&&p.personId===actor.discordId&&
    !['archived','pending'].includes(p.lifecycleState)).length===1);
}
export function canManagePathway(actor,dept,verifiedInstructor=false){
 if(!PATHWAY_DEPARTMENTS.includes(dept)||!actor?.departments?.includes(dept)||
    !ID.test(actor.discordId)||actor.uid!=='discord:'+actor.discordId)return false;
 return ['middenkader','officierenkader','korpsleiding'].includes(roleForDepartment(actor,dept))||
  verifiedInstructor===true;
}
// Individuele opleidingsverplichtingen worden enkel door kader/zoneleiding
// voorgesteld. Instructeurs kunnen wel het optionele aanbod beheren.
export const canManageIndividualPathway=(actor,dept)=>
 canManagePathway(actor,dept,false);

export function uniquePathwaySubject(roster,department,personId,course=null){
 if(!PATHWAY_DEPARTMENTS.includes(department)||!ID.test(personId)||
   !Array.isArray(roster))return null;
 const matches=roster.filter(p=>p.dept===department&&p.personId===personId&&
   !['archived','pending'].includes(p.lifecycleState));
 if(matches.length!==1)return null;
 return course&&!recordRelevantToCourse(matches[0],course)?null:matches[0];
}
export function validIndividualRequirement(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).some(k=>!['subjectDiscordId','mandatory','effectiveDate','validMonths','reason'].includes(k))||
   typeof body.subjectDiscordId!=='string'||!ID.test(body.subjectDiscordId))
   throw Error('Selecteer één geldig personeelslid');
 const r=validRequirement({mandatory:body.mandatory,targetKind:'alle',
   effectiveDate:body.effectiveDate,validMonths:body.validMonths,reason:body.reason});
 return {subjectDiscordId:body.subjectDiscordId,mandatory:r.mandatory,
   effectiveDate:r.effectiveDate,validMonths:r.validMonths,reason:r.reason};
}
export function personalRequirementApplies(person,course,assignment,now=new Date().toISOString().slice(0,10)){
 return Boolean(assignment?.active===true&&
   assignment.department===course.department&&
   assignment.courseId===course.id&&
   assignment.subjectDiscordId===person?.personId&&
   (!assignment.effectiveDate||assignment.effectiveDate<=now)&&
   recordRelevantToCourse(person,course));
}
export function canApprovePathway(actor,stage){
 if(!actor||!ID.test(actor.discordId)||actor.uid!=='discord:'+actor.discordId||
    actor.discordRosterEditorVerified!==true||
    !actor.departments?.includes('politie'))return false;
 const rank=roleForDepartment(actor,'politie');
 return stage==='ok'?rank==='officierenkader':stage==='kl'&&rank==='korpsleiding';
}
export function validPathwayCourse(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).some(k=>!['department','name','description','zone','mandatoryRequested'].includes(k)))
   throw Error('Ongeldige opleidingsgegevens');
 const department=clean(body.department,30),name=clean(body.name,120),
   description=clean(body.description||'',500),zone=clean(body.zone||'',80);
 if((body.name||'').length>120||(body.description||'').length>500||
    (body.zone||'').length>80)throw Error('Opleidingsvelden zijn te lang');
 if(!PATHWAY_DEPARTMENTS.includes(department)||typeof body.name!=='string'||
    name.length<3||name.length>120||unsafe(name)||unsafe(description)||unsafe(zone)||
    (body.mandatoryRequested!==undefined&&typeof body.mandatoryRequested!=='boolean'))
   throw Error('Vul een geldige dienst, naam en eventuele zone in');
 return {department,name,description,zone,mandatoryRequested:body.mandatoryRequested===true};
}
export function validRequirement(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['mandatory','targetKind','targetValue','effectiveDate','validMonths','reason'].includes(k)))
    throw Error('Ongeldig voorstel');
 const mandatory=body.mandatory===true;
 if(typeof body.mandatory!=='boolean')throw Error('Verplichting moet ja of nee zijn');
 const targetKind=clean(body.targetKind||'alle',30);
 const targetValue=clean(body.targetValue||'',80);
 const effectiveDate=clean(body.effectiveDate||new Date().toISOString().slice(0,10),10);
 const validMonths=Number(body.validMonths||0);
 const reason=clean(body.reason,500);
 if(!['alle','rang','specialisatie'].includes(targetKind)||
    (targetKind!=='alle'&&(targetValue.length<2||unsafe(targetValue)))||
    !isoDay(effectiveDate)||!Number.isInteger(validMonths)||validMonths<0||validMonths>120||
    reason.length<10||reason.length>500||unsafe(reason))
   throw Error('Vul de doelgroep, geldigheid en een motivering van 10–500 tekens in');
 return {mandatory,targetKind,targetValue:targetKind==='alle'?'':targetValue,
   effectiveDate,validMonths,reason};
}
export function recordRelevantToCourse(person,course){
 if(!course.zone)return true;
 const zone=keyName(person.zone||person.fireZone||person.zoneName||'');
 // Unknown official zone mapping never creates an automatic obligation.
 return Boolean(zone)&&zone===keyName(course.zone);
}
export function requirementApplies(person,course,now=new Date().toISOString().slice(0,10)){
 if(course.mandatory!==true||!recordRelevantToCourse(person,course)||
    course.effectiveDate&&course.effectiveDate>now)return false;
 if(course.targetKind==='rang')return keyName(person.rank).includes(keyName(course.targetValue));
 if(course.targetKind==='specialisatie'){
   const labels=[...(Array.isArray(person.specializations)?person.specializations:[]),
     ...(Array.isArray(person.specialties)?person.specialties:[])];
   return labels.some(s=>keyName(typeof s==='string'?s:s?.label||s?.name)===keyName(course.targetValue));
 }
 return true;
}
export function pathwayProgress(person,course,records=[],requests=[],now=new Date().toISOString().slice(0,10)){
 const matches=records.filter(x=>keyName(x.courseName)===keyName(course.name)&&
   x.status!=='verwijderd'&&x.testRecord!==true&&
   x.rosterStatus!=='ter_controle'&&isoDay(x.eventDate));
 matches.sort((a,b)=>String(b.eventDate).localeCompare(String(a.eventDate)));
 const pass=matches.find(x=>x.result==='geslaagd');
 const latest=matches[0]||null;
 let expiry=null;
 if(pass&&course.validMonths>0){
  const date=new Date(pass.eventDate+'T12:00:00Z');
  const day=date.getUTCDate();date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()+course.validMonths);
  date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));
  expiry=date.toISOString().slice(0,10);
 }
 let status='nog_te_volgen';
 if(pass&&(!expiry||expiry>=now))status='behaald';
 else if(pass&&expiry&&expiry<now)status='verlopen';
 else if(requests.some(x=>keyName(x.courseName)===keyName(course.name)&&
   ['nieuw','gelezen','gepland'].includes(x.status)))status='aangevraagd';
 else if(latest?.result==='niet_geslaagd')status='niet_geslaagd';
 else if(latest?.result==='onderbroken')status='onderbroken';
 else if(latest?.result==='aanwezig')status='aanwezig';
 return {status,mandatory:requirementApplies(person,course,now),
   lastResult:latest?.result||null,lastDate:latest?.eventDate||null,
   passedDate:pass?.eventDate||null,expiresOn:expiry};
}
export function basePathwayCourses(dept){
 return (TRAINING_REQUEST_COURSE_CATALOG[dept]||[]).map(name=>({
  id:'default:'+dept+':'+keyName(name),department:dept,name,
  description:'Bestaande opleidingscatalogus',zone:'',source:'standaard',
  mandatory:false,targetKind:'alle',targetValue:'',effectiveDate:null,
  validMonths:0,active:true,pending:null
 }));
}
export function publicPathwayCourse(doc){
 const p=doc||{};
 return {id:p.id,department:p.department,name:p.name,
  description:p.description||'',zone:p.zone||'',source:p.source||'eigen',
  mandatory:p.mandatory===true,targetKind:p.targetKind||'alle',
  targetValue:p.targetValue||'',effectiveDate:p.effectiveDate||null,
  validMonths:p.validMonths||0,active:p.active!==false,
  pendingStage:p.pending?.stage||null};
}
export function requestableCustomCourses(rows,dept,person){
 return rows.filter(x=>x.department===dept&&x.active!==false&&
   (!x.zone||(person&&recordRelevantToCourse(person,x)))).map(x=>x.name);
}
