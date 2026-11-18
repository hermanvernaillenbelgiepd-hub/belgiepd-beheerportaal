import {coursesForDepartment} from '../public/training-course-catalog.js';
import {roleForDepartment} from './leave-policy.js';

export const TRAINING_REQUEST_DEPARTMENTS=Object.freeze(['politie','ambulance','brandweer','depannage']);
export const POLICE_REQUEST_COURSES=Object.freeze([
  'RADIO OPLEIDING (VERPLICHT)','RADIO OPLEIDING (VRIJWILLIG)',
  'BASISCURSIS','GEWELDBEHEERSING','WAPENGEBRUIK',
  'VERKEERSBEGELEIDING','VERKEERSCONTROLE','PRIORITAIR RIJDEN',
  'EHBO VOOR INTERVENIERENDEN','BEVEILIGEN OPENBARE WEG',
  'K-9','RAGO','MOTARD','MOTARD-OFF ROAD','DISPATCH',
  'BEVOEGDHEDEN TO','ERT AE-I','ERT AE-T','ERT-AE-F'
]);
// Door de beheerder bevestigde reekshoofden, geen impliciete toegang
// vanuit het label "Reeks" alleen. De reeks van de aanvrager komt uit
// de actuele personeelsbron.
export const SERIES_LEADERS=Object.freeze({
  '01':Object.freeze(['947114717724413952']),
  '02':Object.freeze(['298799630458552323']),
  '03':Object.freeze(['1103170819355574328','1222286882331824208','344065695635734528','1171128215708909602'])
});
const nCall=value=>{
  const found=String(value||'').trim().match(/^(?:[a-z]{1,12}[- ]?)?(\d{3})$/i);
  return found?Number(found[1]):null;
};
export function policeRequestTier(person){
  if(person?.dept!=='politie')return null;
  const n=nCall(person.call);
  if(n!==null&&n>=100&&n<300)return 'agentenkader';
  if(n!==null&&n>=300&&n<600)return 'basiskader';
  if(n!==null&&n>=600&&n<900)return 'middenkader';
  // Officierenkader and Korpsleiding must match a roster grade, in addition
  // to their verified, service-scoped management role at submission time.
  const grade=String(person.rank||'')+' '+String(person.kader||'');
  if(n!==null&&n>=900&&n<1000&&
     /commissaris|officierenkader|korpsleiding|\b(?:a-?cp|1-?cp|1-?hcp|cp)\b/i.test(grade))
    return n===900||n===910?'korpsleiding':'officierenkader';
  return null;
}
export function personSeries(person){
  const series=String(person?.seriesRaw||person?.series||'').trim();
  const n=/^(?:reeks\s*)?0?([1-9]\d?)$/i.exec(series);
  return n?String(Number(n[1])).padStart(2,'0'):null;
}
export function requestCourseOptions(dept,tier){
  if(dept==='politie'){
    return tier==='middenkader'?[]:POLICE_REQUEST_COURSES;
  }
  return coursesForDepartment(dept)||[];
}
export function canSubmitTrainingRequest(person,tier,actorRole=null,verifiedOwnRecord=false){
  if(!person||!TRAINING_REQUEST_DEPARTMENTS.includes(person.dept))return false;
  if(person.dept!=='politie')return true;
  // Korpsleiding is de hoogste operationele graad. Een opleidingsaanvraag
  // voor zichzelf kan nooit naar een hogere beoordelaar worden doorgestuurd.
  // Dit geldt ook voor één geverifieerde eigen personeelsfiche.
  if(tier==='korpsleiding')return false;
  // Een eigen opleidingsaanvraag verleent geen dossier-/beheerdersrechten.
  // De eigen-registratie-uitzondering is alleen toegestaan tot OFFICIERENKADER.
  if(verifiedOwnRecord===true)return true;
  if(tier==='agentenkader'||tier==='basiskader')return true;
  if(tier==='officierenkader')
    return ['officierenkader','korpsleiding'].includes(actorRole);
  return tier==='middenkader'&&['middenkader','officierenkader','korpsleiding','beheerder'].includes(actorRole);
}
// Algemene politieopleidingen: ieder geverifieerd Middenkader- of hoger
// kadermandaat behandelt lagere rangen binnen de eigen discipline.
export function mayReviewTrainingRequest(actor,request){
  if(!actor||!request||actor.discordId===request.applicantDiscordId)return false;
  const dept=request.department;
  if(!TRAINING_REQUEST_DEPARTMENTS.includes(dept)||!actor.departments?.includes(dept))return false;
  const scoped=roleForDepartment(actor,dept);
  if(dept==='politie'){
    if(['officierenkader','korpsleiding'].includes(request.applicantTier))
      return scoped==='korpsleiding';
    if(request.applicantTier==='middenkader')
      return ['officierenkader','korpsleiding'].includes(scoped);
    if(['agentenkader','basiskader'].includes(request.applicantTier))
      return ['middenkader','officierenkader','korpsleiding'].includes(scoped);
    return false;
  }
  return ['middenkader','officierenkader','korpsleiding'].includes(scoped);
}

// Specialisatie-instructeurs mogen alleen aanvragen van HUN discipline en
// (voor Politie) HUN specifieke specialisatie behandelen. Dienstleiding
// gebruikt het bovenstaande afzonderlijke, goedgekeurde kaderrecht.
export function mayInstructorReviewTrainingRequest(actor,request,verifiedRoleIds=[]){
  if(!actor||!request||actor.discordId===request.applicantDiscordId||
     !actor.departments?.includes(request.department)||!Array.isArray(verifiedRoleIds))return false;
  const roles=new Set(verifiedRoleIds);
  if(request.department==='politie'){
    if(!['agentenkader','basiskader'].includes(request.applicantTier))return false;
    const course=String(request.courseName||'').toLocaleUpperCase('nl-BE')
      .replace(/\s+/g,' ').trim();
    const scope=[
      [/^K-?9$/, '1345302115689431061'],
      [/^RAGO$/, '1393050551188721865'],
      [/^MOTARD(?:-OFF ROAD)?$/, '1359656762289946755'],
      [/^DISPATCH$/, '1393050971604516904'],
      [/^(?:ERT[- ]?)?AE[- ]?[ITF]$/, '1337156006597103746']
    ];
    return scope.some(([name,id])=>name.test(course)&&roles.has(id));
  }
  const other={
    ambulance:'1309532437952466988',
    brandweer:'1309532437952466989'
  };
  return Boolean(other[request.department]&&roles.has(other[request.department]));
}

export function validateTrainingRequestInput(body,options,tier){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['department','course','varia','note'].includes(key)))
    throw Error('Ongeldige opleidingsaanvraag');
  const course=typeof body.course==='string'?body.course.trim():'';
  const varia=typeof body.varia==='string'?body.varia.trim():'';
  const note=typeof body.note==='string'?body.note.trim():'';
  if(note.length>500)throw Error('Toelichting is te lang');
  if(varia.length>150)throw Error('VARIA-opleiding is te lang');
  const free=tier==='middenkader'||course==='VARIA';
  if(!free&&!(options||[]).includes(course))throw Error('Selecteer een toegelaten opleiding');
  if(free&&(varia.length<3||varia.length>150))throw Error('Vul een opleidingsnaam van 3 tot 150 tekens in');
  return {courseName:free?varia:course,isVaria:free,note};
}
// Old 'gegeven' remains readable as a completed legacy request. New
// completed training must pass through a real, scheduled calendar session.
export const TRAINING_REQUEST_STATUSES=Object.freeze([
 'nieuw','gelezen','gepland','afgewezen','uitgevoerd','gegeven','gewist'
]);
export const ACTIVE_TRAINING_REQUEST_STATUSES=Object.freeze(['nieuw','gelezen','gepland']);
export function nextTrainingRequestStatus(oldStatus,action){
 if(!TRAINING_REQUEST_STATUSES.includes(oldStatus))throw Error('Onbekende aanvraagstatus');
 if(oldStatus==='gewist')throw Error('Deze aanvraag is reeds gearchiveerd');
 if(action==='gelezen'&&oldStatus==='nieuw')return 'gelezen';
 if(action==='gepland'&&['nieuw','gelezen'].includes(oldStatus))return 'gepland';
 if(action==='afgewezen'&&['nieuw','gelezen'].includes(oldStatus))return 'afgewezen';
 if(action==='uitgevoerd'&&oldStatus==='gepland')return 'uitgevoerd';
 if(action==='wissen'&&['uitgevoerd','gegeven'].includes(oldStatus))return 'gewist';
 // Compatibility for historical records/tests only. New API blocks 'gegeven'.
 if(action==='gegeven'&&['nieuw','gelezen'].includes(oldStatus))return 'gegeven';
 throw Error('Deze handeling is voor deze aanvraagstatus niet mogelijk');
}
export function validTrainingSchedule(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Ongeldige planning');
 const allowed=['startAt','endAt','location'];
 if(Object.keys(body).some(x=>!allowed.includes(x)))throw Error('Onbekende planningsvelden');
 const start=body.startAt,end=body.endAt,location=body.location;
 // Require an explicit timezone offset in the ISO timestamp. Prevent DST
 // ambiguity and never silently assume UTC for an event in Brussels.
 const stamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
 if(typeof start!=='string'||typeof end!=='string'||!stamp.test(start)||!stamp.test(end))
  throw Error('Gebruik een datum en uur met tijdzone');
 const from=Date.parse(start),to=Date.parse(end);
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>24*3600*1000)
  throw Error('Ongeldige begin- of eindtijd');
 if(from<Date.now()-10*60*1000)throw Error('Plan geen opleiding in het verleden');
 if(typeof location!=='string'||location.trim().length<2||location.trim().length>120)
  throw Error('Vul een locatie in (maximaal 120 tekens)');
 return {startAt:new Date(from).toISOString(),endAt:new Date(to).toISOString(),
  location:location.trim()};
}
