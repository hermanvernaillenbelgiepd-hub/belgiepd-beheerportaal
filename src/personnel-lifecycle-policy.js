import {ROLE_CATALOG} from './role-catalog.js';

// Reversible, service-scoped personnel lifecycle. All historical dossiers stay
// in their original collections; this register controls active roster display.
export const PERSONNEL_LIFECYCLE_COLLECTION='bpd_personnel_lifecycle';
export const LIFECYCLE_SERVICES=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
const SERVICE=new Set(LIFECYCLE_SERVICES);
const ID=/^\d{15,22}$/;
export const lifecycleKey=(dept,id)=>SERVICE.has(dept)&&ID.test(String(id||''))?
 dept+'_'+id:null;
export const HONORABLE_REQUEST_COLLECTION='bpd_honorable_resignation_requests';
export function validateHonorableRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(x=>!['department','reason'].includes(x))||
  body.department!=='politie')throw Error('Eervol ontslag aanvragen kan binnen Politie');
 const reason=String(body.reason||'').trim();
 if(reason.length<10||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering van 10 tot 500 tekens vereist');
 return {department:'politie',reason};
}
export function validateHonorableDecision(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(x=>!['decision','reason'].includes(x))||
  !['approve','reject'].includes(body.decision))
  throw Error('Ongeldige beslissing over eervol ontslag');
 const reason=String(body.reason||'').trim();
 if(reason.length<10||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering van 10 tot 500 tekens vereist');
 return {decision:body.decision,reason};
}
// Historical credentials survive archival. Restored assignments are explicitly
// REASSESSED, never reactivated just because they existed in a past snapshot.
export const HONORABLE_REENTRY_REQUIRES=Object.freeze({
 entryRank:'Inspecteur',trainingHistoryPreserved:true,decorationsPreserved:true,
 priorSpecializationTrainingEligible:true,automaticOperationalPrivileges:false
});

// An independently approved INP placement is the only path for an honourably
// retired police member. Historical specialties remain evidence, not active roles.
const INP_CALL=/^(?:S[- ]?)?4\d{2}$/i;
export function validateHonorableInpActivation(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['newCall','series','reason','expectedRevision','confirm'].includes(k)))
  throw Error('Ongeldige INP-herinstroom');
 const newCall=String(body.newCall||'').trim();
 if(!INP_CALL.test(newCall))throw Error('Herinstroom als INP vereist een vrij 4xx-nummer');
 const series=String(body.series||'').trim();
 if(!['1','2','3'].includes(series))throw Error('Kies reeks 1, 2 of 3');
 const reason=String(body.reason||'').trim();
 if(reason.length<20||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering van 20 tot 500 tekens vereist');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw Error('Herlaad de personeelsfiche vóór bevestiging');
 if(body.confirm!=='INP')throw Error('Bevestig expliciet INP');
 return {newCall:String(Number(newCall.match(/4\d{2}/)[0])),series,reason,
  expectedRevision:body.expectedRevision};
}
const PRIOR_TRACKS=Object.freeze([
 ['K9',/\bK[- ]?9\b/i],['RAGO',/\bRAGO\b/i],
 ['MOTARD',/\bMOTARD\b/i],['DISPATCH',/\bDISPATCH\b/i],
 ['AE',/\b(?:AE[- ]?[ITF]|ERT[- ]?AE)\b/i]
]);
export function honorablePreviousTraining(snapshot){
 const specialties=Array.isArray(snapshot?.specialties)?snapshot.specialties:[];
 return PRIOR_TRACKS.filter(([,re])=>specialties.some(s=>
  s&&typeof s.label==='string'&&re.test(s.label)&&
  !/\b(?:IO|IN OPLEIDING|STAGE)\b/i.test(s.label)&&
  /^(?:ja|behaald|volwaardig|actief|instructeur|gekwalificeerd)$/i.test(String(s.value||'').trim())
 )).map(([label])=>label);
}
export function validHonorableInpAssignment(data){
 return Boolean(data&&data.rank==='Inspecteur'&&
  INP_CALL.test(String(data.call||''))&&['1','2','3'].includes(String(data.series||''))&&
  data.confirmed===true);
}
export function applyHonorableInpAssignment(person,ledger){
 if(!ledger?.honorableResignation||ledger.state!=='active')return person;
 // An archived high-rank subject is NEVER resurfaced as its previous grade.
 if(!validHonorableInpAssignment(ledger.honorableInpAssignment))return null;
 const a=ledger.honorableInpAssignment;
 return {...person,call:a.call,rank:'Inspecteur',
   series:'Reeks '+a.series,seriesRaw:a.series,status:'Actief',
   specialties:[],special:'Geen actieve specialisaties',
   honorableReentry:true,
   previousSpecializationTraining:honorablePreviousTraining(ledger.snapshot)};
}

export const ARCHIVE_REASONS=Object.freeze(['voluntary_discord_leave','management_dismissal',
 'inactive_dismissal','service_resignation','other']);
export function validateLifecycleAction(body,action){
 if(!['archive','restore','activate'].includes(action)||!body||typeof body!=='object'||
    Array.isArray(body))throw Error('Ongeldige personeelsactie');
 const allowed=action==='archive'?
  ['reason','cause','expectedRevision','scope']:['reason','expectedRevision'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw Error('Onbekende personeelsactie');
 const reason=String(body.reason||'').trim();
 if(reason.length<10||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering moet 10 tot 500 tekens bevatten');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw Error('Het archief is intussen gewijzigd. Vernieuw de personeelsfiche');
 const cause=action==='archive'?String(body.cause||''):'return_to_service';
 if(action==='archive'&&!ARCHIVE_REASONS.includes(cause))
  throw Error('Kies een geldige ontslagreden');
 const scope=action==='archive'?String(body.scope||'service'):'service';
 if(!['service','global'].includes(scope))
  throw Error('Kies een geldige archiveringsomvang');
 return {reason,cause,scope,expectedRevision:body.expectedRevision};
}
export function lifecycleSourceSnapshot(p){
 if(!p||!lifecycleKey(p.dept,p.personId))return null;
 return {dept:p.dept,personId:p.personId,
  name:String(p.name||'').slice(0,120),call:String(p.call||'').slice(0,24),
  rank:String(p.rank||'').slice(0,100),series:String(p.series||'').slice(0,100),
  seriesRaw:String(p.seriesRaw||'').slice(0,100),
  status:String(p.status||'').slice(0,100),
  specialties:Array.isArray(p.specialties)?p.specialties.slice(0,100)
   .filter(s=>s&&typeof s.label==='string'&&typeof s.value==='string')
   .map(s=>({label:s.label.slice(0,90),value:s.value.slice(0,90),
     source:s.source==='manual'?'manual':'historical'})):[],
  hours:Number.isFinite(p.hours)?p.hours:null,
  totalHours:Number.isFinite(p.totalHours)?p.totalHours:null,
  lastConnection:typeof p.lastConnection==='string'?p.lastConnection.slice(0,80):null};
}
export function overlayPersonnelLifecycle(records,docs,{includeArchived=false}={}){
 const byKey=new Map();
 for(const doc of docs||[]){
  const id=typeof doc?.id==='string'?doc.id:null;
  const d=typeof doc?.data==='function'?doc.data():doc;
  const key=lifecycleKey(d?.dept,d?.discordId);
  if(!key||(id&&id!==key)||byKey.has(key)||
     !['archived','pending','active'].includes(d.state))continue;
  byKey.set(key,d);
 }
 const out=[],seen=new Set();
 for(const p of records||[]){
  const key=lifecycleKey(p?.dept,p?.personId);
  const state=key?byKey.get(key):null;
  if(key)seen.add(key);
  if(state&&['archived','pending'].includes(state.state)){
   if(includeArchived)out.push({...p,lifecycleState:state.state,lifecycleRevision:state.revision,
     lifecycleCause:state.cause||'',lastPersonnelAction:'archived'});
  }else if(state){
    const current=applyHonorableInpAssignment({...p,lifecycleState:'active',
      lifecycleRevision:state.revision,lastPersonnelAction:state.cause||'restored'},state);
    if(current)out.push(current);
  }else out.push(p);
 }
 // A returning worker may have disappeared from the old Google spreadsheet.
 // Their archived identity is never lost and is restored only by a signed,
 // audited, explicitly active lifecycle decision.
 for(const [key,d] of byKey){
  if(seen.has(key)||!d.snapshot||!lifecycleKey(d.snapshot.dept,d.snapshot.personId)||
     key!==lifecycleKey(d.snapshot.dept,d.snapshot.personId))continue;
  if(['archived','pending'].includes(d.state)&&!includeArchived)continue;
  if(d.state==='active'&&d.restoreFromArchive!==true)continue;
  const p={...d.snapshot,id:d.dept+':'+d.discordId,
    specialties:Array.isArray(d.snapshot.specialties)?d.snapshot.specialties:[],
    special:'Geen geregistreerde specialisaties',source:'firestore-lifecycle',
    lifecycleState:d.state,lifecycleRevision:d.revision,
    lastPersonnelAction:d.cause||'restored'};
  const current=applyHonorableInpAssignment(p,d);
  if(current)out.push(current);
 }
 return out;
}
// Read-only discrepancy detection. No automatic dismissal from Discord absence.
const SERVICE_ROLE_IDS=new Map(LIFECYCLE_SERVICES.map(dept=>[
 dept,new Set(ROLE_CATALOG.filter(r=>r.dept===dept&&r.kind==='lidmaatschap'&&
  r.stage!=='interesse').map(r=>r.id))
]));
export function possibleDiscordDepartures(records,snapshot){
 if(snapshot?.status!=='ok'||!(snapshot.entries instanceof Map))return [];
 const groups=new Map(),duplicates=new Set();
 for(const p of records||[]){
  const key=lifecycleKey(p?.dept,p?.personId);
  if(!key)continue;
  if(groups.has(key))duplicates.add(key);
  groups.set(key,p);
 }
 return [...groups].flatMap(([key,p])=>{
  if(duplicates.has(key))return [];
  let evidence=null;
  if(!snapshot.entries.has(p.personId))evidence='not_in_successful_api_snapshot';
  else{
   const roles=snapshot.entries.get(p.personId),membership=SERVICE_ROLE_IDS.get(p.dept);
   if(Array.isArray(roles)&&membership?.size&&!roles.some(id=>membership.has(id)))
    evidence='service_roles_missing_in_verified_snapshot';
  }
  return evidence?[{dept:p.dept,discordId:p.personId,name:String(p.name||'').slice(0,120),
   call:String(p.call||'').slice(0,24),evidence,displayOnly:true}]:[];
 });
}
