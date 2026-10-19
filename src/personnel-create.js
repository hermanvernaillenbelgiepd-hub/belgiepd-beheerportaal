import {roleForDepartment} from './leave-policy.js';
import {validPersonnelKey,EDITABLE_STATUSES} from './personnel-editor-policy.js';
// New profiles never grant Discord roles or module permissions.
// The pilot is limited to an isolated Firebase test project with fixtures.
export const CREATED_PERSONNEL_COLLECTION='bpd_personnel_created';
// Incomplete staff identity stored independently from active personnel records.
export const PENDING_PERSONNEL_COLLECTION='bpd_personnel_pending_links';
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
  // No placeholder Discord ID: an unlinked person receives an internal Firestore ID.
  if(!TEST_RANKS[dept]||(discordId&&!validPersonnelKey(dept,discordId)))
    throw Error('Ongeldige hulpdienst of Discord-ID');
  const name=safe(body.name,2,120,'Naam'),call=safe(body.call,1,24,'Roepnummer');
  const rank=String(body.rank||'');
  if(!TEST_RANKS[dept]?.includes(rank))throw Error('Kies een geldige instaprang voor deze hulpdienst');
  return {dept,discordId:discordId||null,name,call,rank,reason:safe(body.reason,10,500,'Motivering')};
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
  if(person.discordId&&records.some(p=>p.dept===person.dept&&p.personId===person.discordId))
    throw Error('Deze Discord-ID heeft al een personeelsfiche in deze hulpdienst');
  if(records.some(p=>p.dept===person.dept&&
    String(p.call||'').trim().toLocaleLowerCase('nl')===person.call.toLocaleLowerCase('nl')))
    throw Error('Dit roepnummer bestaat al binnen deze hulpdienst');
}

export function visiblePendingPersonnel(id,data){
  if(!/^[A-Za-z0-9]{12,40}$/.test(id)||!data||
     !TEST_RANKS[data.dept]?.includes(data.rank)||
     typeof data.name!=='string'||typeof data.call!=='string'||
     data.state!=='awaiting_discord'||data.discordId!==null)return null;
  return {internalId:id,dept:data.dept,name:data.name,call:data.call,
    rank:data.rank,status:data.linkRequest?.state==='awaiting_approval'?'Wacht op kadergoedkeuring':'Wacht op Discord-koppeling',
    request:data.linkRequest?.state==='awaiting_approval'&&/^\d{15,22}$/.test(data.linkRequest.discordId)?
      {discordId:data.linkRequest.discordId,username:String(data.linkRequest.username||'').slice(0,80)}:null};
}
