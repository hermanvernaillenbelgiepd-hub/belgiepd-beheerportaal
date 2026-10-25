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
  // Een opleidingsaanvraag voor JEZELF is geen beheerdershandeling.
  // De server mag dit uitsluitend toestaan wanneer de aangemelde Discord-ID
  // exact één actuele politiepersoneelsfiche heeft. Dit verleent geen
  // lees-, dossier- of beoordelingsrechten aan de aanvrager.
  if(verifiedOwnRecord===true)return true;
  if(tier==='agentenkader'||tier==='basiskader')return true;
  if(tier==='officierenkader'||tier==='korpsleiding')
    return ['officierenkader','korpsleiding'].includes(actorRole);
  return tier==='middenkader'&&['middenkader','officierenkader','korpsleiding','beheerder'].includes(actorRole);
}
export function mayReviewTrainingRequest(actor,request){
  if(!actor||!request||actor.discordId===request.applicantDiscordId)return false;
  const dept=request.department;
  if(!TRAINING_REQUEST_DEPARTMENTS.includes(dept))return false;
  const scoped=roleForDepartment(actor,dept);
  // Technisch beheer heeft enkel toegang binnen uitdrukkelijk toegekende diensten.
  if(!actor.departments?.includes(dept))return false;
  if(dept==='politie'){
    if(['officierenkader','korpsleiding'].includes(scoped))return true;
    if(request.applicantTier==='middenkader')return false;
    return ['agentenkader','basiskader'].includes(request.applicantTier)&&
      Boolean(request.series&&SERIES_LEADERS[request.series]?.includes(actor.discordId));
  }
  return ['middenkader','officierenkader','korpsleiding'].includes(scoped);
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
export const TRAINING_REQUEST_STATUSES=Object.freeze(['nieuw','gelezen','gegeven','gewist']);
export function nextTrainingRequestStatus(oldStatus,action){
  if(!TRAINING_REQUEST_STATUSES.includes(oldStatus))throw Error('Onbekende aanvraagstatus');
  if(oldStatus==='gewist')throw Error('Deze aanvraag is reeds verwijderd');
  if(action==='gelezen'&&oldStatus==='nieuw')return 'gelezen';
  if(action==='gegeven'&&['nieuw','gelezen'].includes(oldStatus))return 'gegeven';
  if(action==='wissen')return 'gewist';
  throw Error('Deze handeling is voor deze aanvraagstatus niet mogelijk');
}
