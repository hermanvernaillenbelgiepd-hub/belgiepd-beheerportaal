import {roleForDepartment} from './leave-policy.js';
import {validPersonnelKey,EDITABLE_STATUSES} from './personnel-editor-policy.js';
// New profiles never grant Discord roles or module permissions.
// The pilot is limited to an isolated Firebase test project with fixtures.
export const CREATED_PERSONNEL_COLLECTION='bpd_personnel_created';
export const TEST_RANKS=Object.freeze({
  politie:['Agent','Aspirant Inspecteur','Inspecteur','Hoofdinspecteur'],
  brandweer:['Brandweerman','Korporaal'],
  ambulance:['Ambulancier'],
  depannage:['Depanneur']
});
function safe(v,min,max,label){
  const s=typeof v==='string'?v.trim():'';
  if(s.length<min||s.length>max||/[\x00-\x1f\x7f<>]/.test(s))throw Error(label+' is ongeldig');
  return s;
}
export function testCreateEnabled(env){
  return env.BPD_TEST_FIXTURES==='true'&&env.FIREBASE_PROJECT_ID==='belgiepd-test'&&
    env.BPD_ENABLE_PERSONNEL_CREATION==='true';
}
export function canCreatePersonnel(actor,dept){
  if(!actor?.departments?.includes(dept)||!TEST_RANKS[dept])return false;
  const role=roleForDepartment(actor,dept);
  if(actor.role==='beheerder'&&role==='beheerder')return true;
  return ['officierenkader','korpsleiding'].includes(actor.role)&&
    ['officierenkader','korpsleiding'].includes(role);
}
export function validateNewPersonnel(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Ongeldige personeelsfiche');
  if(Object.keys(body).some(k=>!['dept','discordId','name','call','rank','reason'].includes(k)))
    throw Error('Onbekend of niet-toegelaten veld');
  const dept=String(body.dept||''),discordId=String(body.discordId||'');
  if(!validPersonnelKey(dept,discordId))throw Error('Ongeldige hulpdienst of Discord-ID');
  const name=safe(body.name,2,120,'Naam'),call=safe(body.call,1,24,'Roepnummer');
  const rank=String(body.rank||'');
  if(!TEST_RANKS[dept]?.includes(rank))throw Error('Kies een geldige instaprang voor deze hulpdienst');
  return {dept,discordId,name,call,rank,reason:safe(body.reason,10,500,'Motivering')};
}
export function asCreatedPersonnel(d){
  if(!d||!validPersonnelKey(d.dept,d.discordId)||!TEST_RANKS[d.dept].includes(d.rank)||
     typeof d.name!=='string'||typeof d.call!=='string'||!EDITABLE_STATUSES.includes(d.status))return null;
  const {dept,discordId,name,call,rank,status}=d;
  return {id:dept+':'+discordId,personId:discordId,name,call,dept,rank,
    series:'Instroom',seriesRaw:'TEST-NIEUW',status,
    specialties:[],special:'Geen geregistreerde specialisaties',hours:null,totalHours:null,
    last:null,lastConnection:null,lastCheck:null,activityStatus:null,lastPing:null,
    pingCount:null,pingResponses:null,source:'firestore-created'};
}
export function uniqueNewPerson(records,person){
  if(records.some(p=>p.dept===person.dept&&p.personId===person.discordId))
    throw Error('Deze Discord-ID heeft al een personeelsfiche in deze hulpdienst');
  if(records.some(p=>p.dept===person.dept&&
    String(p.call||'').trim().toLocaleLowerCase('nl')===person.call.toLocaleLowerCase('nl')))
    throw Error('Dit roepnummer bestaat al binnen deze hulpdienst');
}
