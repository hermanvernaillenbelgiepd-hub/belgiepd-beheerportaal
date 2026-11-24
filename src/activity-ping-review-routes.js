// Police activity reports are separate from official personnel decisions.
// Existing case entries remain the authoritative dossier and weekreport source.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleForDepartment} from './leave-policy.js';
import {brusselsEventDate} from './personnel-event-date.js';
import {canReadPersonnelSubject,canEditGeneralPersonnelInfo,PERSONNEL_EDITS_COLLECTION}
 from './personnel-editor-policy.js';
import {INACTIVITY_PING_NOTICES} from './inactivity-ping-notifications.js';
import {RETURN_CHECK_COLLECTION} from './activity-return-policy.js';

export const ACTIVITY_PING_REVIEWS='bpd_activity_ping_reviews';
const ID=/^\d{15,22}$/;
const ENTRY=/^[A-Za-z0-9_-]{12,120}$/;
const OLD=new Set(['50/50','INACTIEF','NON-ACTIEF','CHECKING']);
const upper=s=>String(s||'').trim().toLocaleUpperCase('nl-BE');
const trim=(s,n=120)=>typeof s==='string'?s.trim().slice(0,n):'';
const iso=s=>s?.toDate?.()?.toISOString?.()||null;
const err=(status,message)=>Object.assign(new Error(message),{httpStatus:status});
export function canReviewPoliceActivity(actor){
 return Boolean(ID.test(String(actor?.discordId||''))&&actor.uid==='discord:'+actor.discordId&&(
  actor?.departments?.includes('politie')&&
   ['officierenkader','korpsleiding'].includes(actor.role)&&
   ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'))||
  actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true));
}
export function activityReviewForNewPing({dept,discordId,entryId,actor,subject,data}){
 if(dept!=='politie'||!ID.test(discordId)||!ENTRY.test(entryId)||
  !ID.test(String(actor?.discordId||''))||!subject||
  typeof data?.discordPingSent!=='boolean'||typeof data.activityStatus!=='string')
  throw Error('Ongeldige activiteitenping voor leiding');
 const previous=upper(subject.status);
 const pending=data.activityStatus==='ACTIEF'&&OLD.has(previous);
 return {type:'activity_ping',dept:'politie',entryId,caseId:dept+'_'+discordId,
  targetDiscordId:discordId,subjectName:trim(subject.name),subjectCall:trim(subject.call,24),
  previousStatus:previous,activityStatus:data.activityStatus,proposedStatus:pending?'ACTIEF':null,
  // A CHECKING from approved leave is a review projection, not always a persisted overlay.
  checkingReturnId:pending&&previous==='CHECKING'&&subject.leaveReturnChecking===true&&
   /^\d{4}-\d{2}-\d{2}$/.test(String(subject.leaveReturnEndDate||''))?
   'politie_'+discordId+'_'+subject.leaveReturnEndDate:null,
  statusBeforeChecking:previous==='CHECKING'&&subject.leaveReturnChecking===true?
   upper(subject.statusBeforeChecking):null,
  state:pending?'pending':'information',
  reporterName:trim(actor.name),reporterCall:trim(actor.call,24),
  reporterDiscordId:actor.discordId,discordPingSent:data.discordPingSent,
  discordPingDate:data.discordPingSent?data.discordPingDate||null:null,
  readBy:{},createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
}
export function publicActivityReview(id,data,subject,actor){
 if(!ENTRY.test(id)||data?.type!=='activity_ping'||data.dept!=='politie'||!subject||
  !canReviewPoliceActivity(actor)||!canReadPersonnelSubject(actor,subject))return null;
 const ready=OLD.has(upper(subject.status))&&upper(subject.status)===data.previousStatus;
 return {id,dept:'politie',subjectName:trim(subject.name),subjectCall:trim(subject.call,24),
  targetDiscordId:subject.personId,reporterName:trim(data.reporterName),
  reporterCall:trim(data.reporterCall,24),previousStatus:trim(data.previousStatus,35),
  currentStatus:trim(subject.status,35),activityStatus:trim(data.activityStatus,45),
  discordPingSent:data.discordPingSent===true,
  discordPingDate:data.discordPingSent?trim(data.discordPingDate,10):null,
  state:data.state,canApprove:data.state==='pending'&&ready&&
   canEditGeneralPersonnelInfo(actor,subject),
  readAt:iso(data.readBy?.[actor.uid]),createdAt:iso(data.createdAt),
  decidedAt:iso(data.decidedAt),decidedBy:trim(data.decidedBy?.name),
  decisionReason:trim(data.decisionReason,500)};
}
export function installActivityPingReviewRoutes(app,{
 requireUser,getSnapshot,dbFactory=getFirestore,env=process.env
}){
 const fail=(res,e)=>res.status(e?.httpStatus||503)
  .json({error:e?.httpStatus?e.message:'Activiteitenopvolging niet beschikbaar'});
 const db=()=>dbFactory();
 async function access(actor,id){
  if(!canReviewPoliceActivity(actor))throw err(403,'Geen bevoegdheid voor deze melding');
  if(!ENTRY.test(id))throw err(400,'Ongeldige melding');
  const snapshot=await getSnapshot({forceRefresh:true});
  if(snapshot.stale||!Array.isArray(snapshot.data))throw err(503,'Personeelsbron niet actueel');
  const ref=db().collection(ACTIVITY_PING_REVIEWS).doc(id),doc=await ref.get();
  if(!doc.exists||doc.get('type')!=='activity_ping'||doc.get('dept')!=='politie')
   throw err(404,'Registratie niet gevonden');
  const roster=snapshot.data.filter(p=>p.dept==='politie'&&
   p.personId===doc.get('targetDiscordId')&&p.lifecycleState!=='archived');
  if(roster.length!==1||!canReadPersonnelSubject(actor,roster[0]))
   throw err(403,'Geen toegang tot dit personeelsdossier');
  return {ref,record:doc.data(),subject:roster[0]};
 }
 app.get('/api/management/activity-ping-reviews',requireUser,async(req,res)=>{
  if(!canReviewPoliceActivity(req.bpd))return res.status(403).json({error:'Geen kaderbevoegdheid'});
  try{
   const snapshot=await getSnapshot();
   if(snapshot.stale||!Array.isArray(snapshot.data))throw err(503,'Personeelsbron niet actueel');
   const people=new Map(snapshot.data.filter(p=>p.dept==='politie'&&
    p.lifecycleState!=='archived').map(p=>[p.personId,p]));
   const query=await db().collection(ACTIVITY_PING_REVIEWS)
    .orderBy('createdAt','desc').limit(120).get();
   const rows=query.docs.map(doc=>publicActivityReview(doc.id,doc.data(),
    people.get(doc.get('targetDiscordId')),req.bpd)).filter(Boolean);
   res.set('Cache-Control','private, no-store');
   return res.json({rows,unread:rows.filter(x=>!x.readAt).length,
    pending:rows.filter(x=>x.state==='pending').length,limited:query.size===120});
  }catch(e){return fail(res,e)}
 });
 app.post('/api/management/activity-ping-reviews/:id/read',requireUser,async(req,res)=>{
  try{
   const {ref}=await access(req.bpd,req.params.id);
   await db().runTransaction(async tx=>{
    const existing=await tx.get(ref);
    if(!existing.exists)throw err(404,'Registratie niet gevonden');
    const readBy={...(existing.get('readBy')||{})};
    if(readBy[req.bpd.uid])return;
    readBy[req.bpd.uid]=FieldValue.serverTimestamp();
    tx.update(ref,{readBy});
   });
   return res.json({ok:true,read:true});
  }catch(e){return fail(res,e)}
 });
 app.post('/api/management/activity-ping-reviews/:id/decision',requireUser,async(req,res)=>{
  const payload=req.body;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   Object.keys(payload).some(x=>!['decision','reason'].includes(x))||
   !['approved','rejected'].includes(payload.decision)||
   typeof payload.reason!=='string'||payload.reason.trim().length<10||
   payload.reason.trim().length>500||/[\x00-\x1f\x7f<>]/.test(payload.reason))
   return res.status(400).json({error:'Beslissing en motivering van 10–500 tekens vereist'});
  if(env.BPD_ENABLE_REGISTRATIONS!=='true'||
    env.BPD_ENABLE_MANAGEMENT_WRITES!=='true')
   return res.status(503).json({error:'Dossierregistratie staat uit'});
  try{
   const {ref,record,subject}=await access(req.bpd,req.params.id);
   if(!canEditGeneralPersonnelInfo(req.bpd,subject))
    throw err(403,'Officiële personeelsbevoegdheid ontbreekt');
   if(record.state!=='pending'||record.proposedStatus!=='ACTIEF')
    throw err(409,'Geen openstaand ACTIEF-voorstel');
   const prior=upper(subject.status);
   if(!OLD.has(prior)||prior!==record.previousStatus)
    throw err(409,'De officiële status is intussen gewijzigd; nieuw voorstel nodig');
   if(prior==='CHECKING'&&subject.leaveReturnChecking===true&&
    (!record.checkingReturnId||record.checkingReturnId!==
     'politie_'+subject.personId+'_'+subject.leaveReturnEndDate))
    throw err(409,'De verlofterugkeercontrole is intussen gewijzigd; nieuw voorstel nodig');
   // Never treat a projected CHECKING as an underlying manual CHECKING.
   if(prior==='CHECKING'&&subject.leaveReturnChecking!==true&&record.checkingReturnId)
    throw err(409,'Verlofterugkeercontrole niet meer geldig');
   if(payload.decision==='approved'&&
    (env.BPD_ENABLE_PERSONNEL_WRITES!=='true'||
     env.BPD_PERSONNEL_OVERRIDES_ACTIVE!=='true'))
    throw err(503,'Officiële personeelswijzigingen staan nog uit');
   const store=db(),overlay=store.collection(PERSONNEL_EDITS_COLLECTION)
    .doc('politie_'+subject.personId);
   const log=store.collection('bpd_cases').doc('politie_'+subject.personId)
    .collection('entries').doc();
   const notice=store.collection('bpd_notices').doc('politie').collection('events').doc();
   const privatePing=store.collection(INACTIVITY_PING_NOTICES).doc(subject.personId)
    .collection('events').doc(ref.id);
   const checkingRef=prior==='CHECKING'&&subject.leaveReturnChecking===true?
    store.collection(RETURN_CHECK_COLLECTION).doc(record.checkingReturnId):null;
   const decision=payload.decision,reason=payload.reason.trim();
   const actor={discordId:req.bpd.discordId,name:trim(req.bpd.name)||'Bevoegd kaderlid',
    call:trim(req.bpd.call,24)};
   await store.runTransaction(async tx=>{
    const [rev,old,notification,checking]=await Promise.all([
     tx.get(ref),tx.get(overlay),tx.get(privatePing),
     checkingRef?tx.get(checkingRef):Promise.resolve(null)]);
    if(!rev.exists||rev.get('state')!=='pending'||
     rev.get('targetDiscordId')!==subject.personId)throw err(409,'Voorstel al afgehandeld');
    // For leave-return CHECKING, the original persisted status is not CHECKING:
    // validate both the underlying status and the pending checking record.
    const persisted=upper(old.exists?old.get('status'):
     (checkingRef?subject.statusBeforeChecking:subject.status));
    const expected=checkingRef?record.statusBeforeChecking:prior;
    if(!expected||persisted!==expected)
     throw err(409,'Personeelsstatus ondertussen aangepast');
    if(checkingRef&&(checking?.get('status')!=='CHECKING'||
      checking.get('dept')!=='politie'||
      checking.get('discordId')!==subject.personId||
      checking.get('endDate')!==subject.leaveReturnEndDate))
     throw err(409,'Verlofterugkeercontrole intussen behandeld of gewijzigd');
    const at=FieldValue.serverTimestamp();
    if(decision==='approved'){
     const data=old.exists?old.data():{};
     const revision=(Number.isSafeInteger(data.revision)?data.revision:0)+1;
     const previous={name:data.name??subject.name,call:data.call??subject.call,
      status:data.status??subject.status};
     const next={...previous,status:'ACTIEF'};
     tx.set(overlay,{...next,dept:'politie',discordId:subject.personId,revision,
      ...(data.approvedRankEdit===true?{approvedRankEdit:true,rank:data.rank}:{}),
      updatedAt:at,updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId});
     if(checkingRef){
      // Close the return review atomically with ACTIEF so the roster projection
      // cannot continue displaying CHECKING after the officer approved.
      tx.update(checkingRef,{status:'ACTIEF',reason,resolvedAt:at,
       resolvedBy:actor,resolvedByUid:req.bpd.uid,
       linkedActivityPingReviewId:ref.id});
     }
     tx.create(overlay.collection('audit').doc(),{previous,next,revision,
      reason,activityPingReviewId:ref.id,actorUid:req.bpd.uid,
      actorDiscordId:req.bpd.discordId,at});
    }
    tx.update(ref,{state:decision,decisionReason:reason,
     decidedBy:actor,decidedAt:at,decidedByUid:req.bpd.uid,updatedAt:at});
    const details='ACTIEF-voorstel bij activiteitenping '+ref.id+': '+
     (decision==='approved'?'goedgekeurd; officiële status '+prior+' → ACTIEF':
      'afgewezen; officiële personeelsstatus ongewijzigd')+
     (checkingRef&&decision==='approved'?
      '. Openstaande CHECKING-terugkeercontrole gelijktijdig afgerond':'')+
     '. Logger: '+record.reporterName+' ('+record.reporterCall+
     '). Beslisser: '+actor.name+' ('+actor.call+'). Motivering: '+reason;
    tx.create(log,{type:'activiteit',reportCategory:'activiteit',
     dept:'politie',source:'activity-ping-review',activityPingReviewId:ref.id,
     subjectDiscordId:subject.personId,subjectNameAtCreation:subject.name,
     subjectCallAtCreation:subject.call,eventDate:brusselsEventDate(),
     details,registeredBy:actor,submittedBy:{uid:req.bpd.uid},
     createdAt:at,modifiedAt:null});
    tx.create(notice,{caseId:'politie_'+subject.personId,
     entryId:log.id,type:'activiteit',dept:'politie',createdAt:at,
     source:'activity-ping-review'});
    if(notification.exists&&notification.get('type')==='inactiviteitsping')
     tx.update(privatePing,{decision,decisionReason:reason,decisionBy:actor,decidedAt:at});
   });
   return res.json({ok:true,decision,officialStatusChanged:decision==='approved',
    dossierLogged:true,fortnightReportLogged:true,discordMessageSent:false});
  }catch(e){return fail(res,e)}
 });
}
