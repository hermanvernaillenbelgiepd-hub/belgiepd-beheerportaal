import {roleForDepartment} from './leave-policy.js';
import {POLICE_PROMOTION_RANKS} from './police-rank-bands.js';
import {validPersonnelKey,EDITABLE_STATUSES} from './personnel-editor-policy.js';
// New profiles never grant Discord roles or module permissions.
// The pilot is limited to an isolated Firebase test project with fixtures.
export const CREATED_PERSONNEL_COLLECTION='bpd_personnel_created';
// Incomplete staff identity stored independently from active personnel records.
export const PENDING_PERSONNEL_COLLECTION='bpd_personnel_pending_links';
export const TEST_RANKS=Object.freeze({
  politie:[...POLICE_PROMOTION_RANKS],
  brandweer:['Brandweerman','Korporaal'],
  ambulance:['Ambulancier'],
  depannage:['Depanneur']
});
// A new police recruit is always an Agent unless leadership explicitly
// authorises an exceptional entry rank with a separately recorded justification.
export const STANDARD_ENTRY_RANK=Object.freeze({
  politie:'Agent',brandweer:'Brandweerman',ambulance:'Ambulancier',depannage:'Depanneur'
});
export function exceptionalPoliceRank(rank,dept){
  return dept==='politie'&&rank!==STANDARD_ENTRY_RANK.politie;
}
// A promotion is one documented police grade at a time; never a direct
// privilege or Discord role change. Earlier entry-rank events stay immutable.
export function nextPoliceRank(rank){
  const ranks=TEST_RANKS.politie;
  const index=ranks.indexOf(rank);
  return index>=0&&index<ranks.length-1?ranks[index+1]:null;
}
export function validatePolicePromotion(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['expectedRank','newRank','reason'].includes(key)))
    throw Error('Ongeldige politiepromotie');
  const expectedRank=body.expectedRank,newRank=body.newRank;
  if(typeof expectedRank!=='string'||nextPoliceRank(expectedRank)!==newRank)
    throw Error('Alleen een promotie naar de eerstvolgende politie-instaprang is toegestaan');
  const reason=safe(body.reason,20,500,'Motivering promotie');
  return {expectedRank,newRank,reason};
}
export function canAuthoriseExceptionalPoliceRank(actor,dept){
  if(dept!=='politie'||!actor?.departments?.includes('politie'))return false;
  const scoped=roleForDepartment(actor,'politie');
  return actor.role==='beheerder'&&scoped==='beheerder'||
    actor.role==='korpsleiding'&&scoped==='korpsleiding';
}
function safe(v,min,max,label){
  const s=typeof v==='string'?v.trim():'';
  if(s.length<min||s.length>max||/[\x00-\x1f\x7f<>]/.test(s))throw Error(label+' is ongeldig');
  return s;
}
export function testCreateEnabled(env){
  return env.BPD_TEST_FIXTURES==='true'&&env.FIREBASE_PROJECT_ID==='belgiepd-test'&&
    env.BPD_ENABLE_PERSONNEL_CREATION==='true';
}
// The production Firestore roster remains visible even when intake is paused.
// These explicit production switches never enable TEST fixtures or legacy edits.
export function personnelDataEnabled(env){
  if(testCreateEnabled(env))return true;
  return env.BPD_TEST_FIXTURES!=='true'&&
    typeof env.FIREBASE_PROJECT_ID==='string'&&
    env.FIREBASE_PROJECT_ID.length>0&&env.FIREBASE_PROJECT_ID!=='belgiepd-test'&&
    env.BPD_PRODUCTION_PERSONNEL_DATA==='true';
}
export function personnelCreationEnabled(env){
  if(testCreateEnabled(env))
    return env.BPD_ENABLE_PERSONNEL_WRITES==='true';
  return personnelDataEnabled(env)&&env.BPD_PRODUCTION_PERSONNEL_CREATION==='true';
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
  if(Object.keys(body).some(k=>!['dept','discordId','name','call','rank','reason','exceptionalRank','exceptionReason'].includes(k)))
    throw Error('Onbekend of niet-toegelaten veld');
  const dept=String(body.dept||''),discordId=String(body.discordId||'');
  // No placeholder Discord ID: an unlinked person receives an internal Firestore ID.
  if(!TEST_RANKS[dept]||(discordId&&!validPersonnelKey(dept,discordId)))
    throw Error('Ongeldige hulpdienst of Discord-ID');
  const name=safe(body.name,2,120,'Naam'),call=safe(body.call,1,24,'Roepnummer');
  const rank=String(body.rank||'');
  if(!TEST_RANKS[dept]?.includes(rank))throw Error('Kies een geldige instaprang voor deze hulpdienst');
  const exceptional=exceptionalPoliceRank(rank,dept);
  const requestedException=body.exceptionalRank===true;
  const exceptionReason=typeof body.exceptionReason==='string'?body.exceptionReason.trim():'';
  if(exceptional){
    if(!requestedException)throw Error('Een uitzonderlijke politie-instaprang moet expliciet worden bevestigd');
    safe(exceptionReason,30,500,'Afzonderlijke motivering uitzonderlijke instaprang');
  }else if(requestedException||exceptionReason)
    throw Error('Een uitzonderlijke instaprang is alleen voor politie boven Agent mogelijk');
  return {dept,discordId:discordId||null,name,call,rank,reason:safe(body.reason,10,500,'Motivering'),
    exceptionalRank:exceptional,exceptionReason:exceptional?exceptionReason:null};
}
export function asCreatedPersonnel(d){
  if(!d||!validPersonnelKey(d.dept,d.discordId)||!TEST_RANKS[d.dept].includes(d.rank)||
     typeof d.name!=='string'||typeof d.call!=='string'||!EDITABLE_STATUSES.includes(d.status))return null;
  const {dept,discordId,name,call,rank,status}=d;
  return {id:dept+':'+discordId,personId:discordId,name,call,dept,rank,
    series:'Instroom',seriesRaw:'FIRESTORE-NIEUW',status,
    specialties:[],special:'Geen geregistreerde specialisaties',hours:null,totalHours:null,
    last:null,lastConnection:null,lastCheck:null,activityStatus:null,lastPing:null,
    pingCount:null,pingResponses:null,source:'firestore-created',createdInFirestore:true};
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
