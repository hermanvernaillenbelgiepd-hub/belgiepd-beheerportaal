import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {brusselsEventDate} from './personnel-event-date.js';
import {PERSONNEL_LIFECYCLE_COLLECTION,LIFECYCLE_SERVICES,lifecycleKey,validateLifecycleAction,
 lifecycleSourceSnapshot,possibleDiscordDepartures,HONORABLE_REQUEST_COLLECTION,
 validateHonorableRequest,validateHonorableDecision,validateHonorableInpActivation,
 honorablePreviousTraining} from './personnel-lifecycle-policy.js';
import {canManageLifecycleDepartment,canReadPersonnelLifecycle,
 canManagePersonnelLifecycle} from './personnel-lifecycle-access.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {departureEvidence} from './personnel-departure-evidence.js';
import {getBelgiumPdDisplayRoles} from './bpd-discord-users-display.js';
import {verifyGuildAuthorizationRoles} from './discord-guild-authorization.js';
import {ROLE_CATALOG} from './role-catalog.js';
import {USER_COLLECTION} from './user-access.js';
import {personnelCallClaimId} from './personnel-editor-policy.js';
import {identityArchiveSubjects,prepareIdentityArchive,writeIdentityArchive}
 from './global-personnel-archive.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const respond=(res,e)=>{
 if(e?.status)return res.status(e.status).json({error:e.message});
 console.error('Personeelsarchief:',e?.code||'unknown');
 return res.status(503).json({error:'Personeelsarchief momenteel niet beschikbaar'});
};
export function installPersonnelLifecycleRoutes(app,{requireUser,getSnapshot,invalidateLifecycle,
 invalidateUserAccess=()=>{}}){
 const db=()=>getFirestore();
 const store=()=>db().collection(PERSONNEL_LIFECYCLE_COLLECTION);
 const allowed=canManagePersonnelLifecycle;
 const resolve=async(dept,id)=>{
  const key=lifecycleKey(dept,id);
  if(!key)throw fail(400,'Ongeldige dienst of Discord ID');
  const snap=await getSnapshot({includeArchived:true});
  if(snap.stale)throw fail(503,'Personeelsbron niet actueel; probeer later');
  const persons=snap.data.filter(p=>p.dept===dept&&p.personId===id);
  if(persons.length!==1)throw fail(409,'Geen eenduidige personeelsfiche; controleer eerst de bron');
  return persons[0];
 };

 // Police-only self-service. A request never changes a rank, Discord role,
 // personnel status, privilege or archive until approved independently.
 const honorable=()=>db().collection(HONORABLE_REQUEST_COLLECTION);
 const policeIdentity=async actor=>{
  const id=String(actor?.discordId||'');
  if(!/^\d{15,22}$/.test(id)||actor?.uid!=='discord:'+id||
     actor?.portalTechnicalMode===true||!actor.departments?.includes('politie'))
   throw fail(403,'Gebruik je goedgekeurde persoonlijke Politie-aanmelding');
  return resolve('politie',id);
 };
 app.get('/api/personnel-lifecycle/honorable/me',requireUser,async(req,res)=>{
  try{
   const person=await policeIdentity(req.bpd);
   const [record,lifecycle]=await Promise.all([
     honorable().doc('politie_'+person.personId).get(),
     store().doc('politie_'+person.personId).get()
   ]);
   const row=record.data()||{};
   res.set('Cache-Control','private, no-store');
   return res.json({eligible:!['archived','pending'].includes(lifecycle.get('state')),
     status:row.status||null,
     reason:row.status==='pending'?String(row.reason||'').slice(0,500):null,
     decidedAt:row.decidedAt?.toDate?.()?.toISOString?.()||null,
     decisionReason:row.status&&row.status!=='pending'?
       String(row.decisionReason||'').slice(0,500):null});
  }catch(e){return respond(res,e)}
 });
 app.post('/api/personnel-lifecycle/honorable/request',requireUser,async(req,res)=>{
  let input;
  try{input=validateHonorableRequest(req.body)}catch(e){return respond(res,fail(400,e.message))}
  try{
   const actor=req.bpd,person=await policeIdentity(actor);
   const id=person.personId,ref=honorable().doc('politie_'+id),
     stateRef=store().doc('politie_'+id);
   await db().runTransaction(async tx=>{
    const [prior,life]=await Promise.all([tx.get(ref),tx.get(stateRef)]);
    if(prior.get('status')==='pending')throw fail(409,'Er is al een openstaande aanvraag');
    if(['archived','pending'].includes(life.get('state')))
      throw fail(409,'Dit dienstverband staat niet actief');
    const at=FieldValue.serverTimestamp();
    tx.set(ref,{department:'politie',discordId:id,status:'pending',
      reason:input.reason,requestedByUid:actor.uid,
      createdAt:at,updatedAt:at,decisionReason:null,decidedAt:null},{merge:true});
    tx.create(ref.collection('audit').doc(),{
      action:'requested',reason:input.reason,actorDiscordId:id,at});
   });
   res.set('Cache-Control','private, no-store');
   return res.status(201).json({saved:true,status:'pending',
     message:'Aanvraag ingediend. Je personeelsfiche blijft actief tot een onafhankelijke goedkeuring.'});
  }catch(e){return respond(res,e)}
 });
 app.get('/api/personnel-lifecycle/honorable/pending',requireUser,async(req,res)=>{
  try{
   if(!canManageLifecycleDepartment(req.bpd,'politie'))
     throw fail(403,'Alleen bevoegd Politiekader kan ontslagaanvragen beoordelen');
   const [requests,snapshot]=await Promise.all([
     honorable().where('department','==','politie').limit(200).get(),
     getSnapshot({includeArchived:true})
   ]);
   if(snapshot.stale)throw fail(503,'Personeelsbron tijdelijk niet actueel');
   const people=new Map(snapshot.data.filter(p=>p.dept==='politie')
     .map(p=>[p.personId,p]));
   const pending=requests.docs.filter(d=>d.get('status')==='pending')
     .filter(d=>allowed(req.bpd,people.get(d.get('discordId'))))
     .map(d=>({discordId:d.get('discordId'),
       name:String(people.get(d.get('discordId'))?.name||'').slice(0,120),
       call:String(people.get(d.get('discordId'))?.call||'').slice(0,24),
       reason:String(d.get('reason')||'').slice(0,500),
       requestedAt:d.get('createdAt')?.toDate?.()?.toISOString?.()||null}));
   res.set('Cache-Control','private, no-store');
   return res.json({pending,limited:requests.size===200});
  }catch(e){return respond(res,e)}
 });
 app.post('/api/personnel-lifecycle/honorable/:discordId/decision',requireUser,async(req,res)=>{
  let input;
  try{input=validateHonorableDecision(req.body)}catch(e){return respond(res,fail(400,e.message))}
  try{
   const discordId=req.params.discordId,person=await resolve('politie',discordId);
   if(!allowed(req.bpd,person))throw fail(403,'Geen onafhankelijke bevoegdheid voor dit personeelslid');
   const requestRef=honorable().doc('politie_'+discordId);
   const stateRef=store().doc('politie_'+discordId);
   const approved=input.decision==='approve';
   const archiveRoster=approved?await getSnapshot({includeArchived:true}):null;
   if(archiveRoster?.stale)throw fail(503,'Personeelsbron niet actueel voor centrale archivering');
   const archiveSubjects=approved?
     identityArchiveSubjects(archiveRoster.data,discordId):[];
   if(approved&&archiveSubjects.some(p=>!allowed(req.bpd,p)))
     throw fail(403,'Centrale archivering vereist bevoegdheid voor alle gekoppelde diensten');
   const result=await db().runTransaction(async tx=>{
    const [request,life]=await Promise.all([tx.get(requestRef),tx.get(stateRef)]);
    if(request.get('status')!=='pending')
      throw fail(409,'Geen openstaande aanvraag voor dit personeelslid');
    if(approved&&['archived','pending'].includes(life.get('state')))
      throw fail(409,'Personeelslid is reeds uit dienst of in herinstroom');
    const archivePlan=approved?await prepareIdentityArchive(tx,db(),{
      subjects:archiveSubjects,primaryDept:'politie',discordId}):null;
    const at=FieldValue.serverTimestamp(),revision=
      Number.isSafeInteger(life.get('revision'))?life.get('revision'):0;
    tx.set(requestRef,{status:approved?'approved':'rejected',
      decisionReason:input.reason,decidedByDiscordId:req.bpd.discordId,
      decidedAt:at,updatedAt:at},{merge:true});
    tx.create(requestRef.collection('audit').doc(),{
      action:approved?'approved':'rejected',reason:input.reason,
      actorDiscordId:req.bpd.discordId,at});
    if(approved){
      const historic=lifecycleSourceSnapshot(person);
      if(!historic)throw fail(409,'Historische personeelsgegevens niet veilig beschikbaar');
      tx.set(stateRef,{dept:'politie',discordId,state:'archived',
        revision:revision+1,snapshot:historic,cause:'honorable_resignation',
        reason:input.reason,archivedAt:at,updatedAt:at,
        updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId,
        cmsRoleSyncPending:true,restoreFromArchive:false,
        honorableResignation:true},{merge:true});
      tx.create(stateRef.collection('audit').doc(),{
        action:'honorable_resignation_approved',cause:'honorable_resignation',
        reason:input.reason,actorDiscordId:req.bpd.discordId,at,
        revision:revision+1});
      // An approved honorable resignation is a real career movement.
      // Record it atomically with archival and audit, without changing prior data.
      const caseRef=db().collection('bpd_cases').doc('politie_'+discordId)
        .collection('entries').doc();
      const noticeRef=db().collection('bpd_notices').doc('politie')
        .collection('events').doc();
      const eventDate=brusselsEventDate();
      tx.create(caseRef,{type:'personeelsbeweging',reportCategory:'personeelsbeweging',
        source:'honorable-resignation',dept:'politie',subjectDiscordId:discordId,
        subjectNameAtCreation:historic.name,subjectCallAtCreation:historic.call,
        subjectRankAtCreation:historic.rank||'',
        eventDate,movement:'Eervol ontslag',previousRank:historic.rank||'',
        newRank:historic.rank||'',previousCall:historic.call||'',
        newCall:historic.call||'',
        details:'Eervol ontslag: Actief → Eervol uit dienst · Motivering: '+input.reason,
        registeredBy:{discordId:req.bpd.discordId,name:req.bpd.name||'Bevoegd kader',
          call:req.bpd.call||''},
        submittedBy:{uid:req.bpd.uid,email:req.bpd.email||null},
        createdAt:at,modifiedAt:null});
      tx.create(noticeRef,{caseId:'politie_'+discordId,entryId:caseRef.id,
        type:'personeelsbeweging',dept:'politie',createdAt:at});
      tx.create(db().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
        type:'personnel_archived',dept:'politie',discordId,
        dossierCaseLogged:true,eventDate,
        name:historic.name,call:historic.call,
        before:'Actief',after:'Eervol uit dienst',cause:'honorable_resignation',
        reason:input.reason,actorDiscordId:req.bpd.discordId,at});
      const cross=writeIdentityArchive(tx,db(),archivePlan,{
        actor:{name:req.bpd.name||'Bevoegd kader',call:req.bpd.call||'',
          discordId:req.bpd.discordId},actorUid:req.bpd.uid,
        reason:input.reason,cause:'honorable_resignation',
        source:'honorable-resignation'});
      return {status:'approved',archived:true,cmsRoleSyncPending:true,...cross};
    }
    return {status:'rejected',archived:false,cmsRoleSyncPending:false};
   });
   if(approved)invalidateLifecycle();
   res.set('Cache-Control','private, no-store');
   return res.json({...result,historyPreserved:true,discordRolesChanged:false});
  }catch(e){return respond(res,e)}
 });
 app.get('/api/personnel-lifecycle/archives',requireUser,async(req,res)=>{
  try{
   const dept=String(req.query.dept||'');
   if(!LIFECYCLE_SERVICES.includes(dept)||
      !canManageLifecycleDepartment(req.bpd,dept))
    throw fail(403,'Geen bevoegdheid tot dit personeelsarchief');
   const [records,snapshot]=await Promise.all([
     store().where('dept','==',dept).limit(600).get(),
     getSnapshot({includeArchived:true})
   ]);
   if(records.size===600)throw fail(503,'Archief is te groot voor veilige weergave');
   const byId=new Map(snapshot.data.filter(p=>p.dept===dept).map(p=>[p.personId,p]));
   const entries=records.docs.filter(d=>['archived','pending'].includes(d.get('state')))
    .filter(d=>{const p=byId.get(d.get('discordId'));return p&&canReadPersonnelLifecycle(req.bpd,p)})
    .map(d=>({dept,discordId:d.get('discordId'),name:String(d.get('snapshot')?.name||'').slice(0,120),
      call:String(d.get('snapshot')?.call||'').slice(0,24),rank:String(d.get('snapshot')?.rank||'').slice(0,100),
      state:d.get('state'),cause:d.get('cause'),reason:String(d.get('reason')||'').slice(0,500),
      archivedAt:d.get('archivedAt')?.toDate?.()?.toISOString?.()||null,
      revision:d.get('revision')||0,
      canRestore:d.get('state')==='archived'&&allowed(req.bpd,byId.get(d.get('discordId'))),
      canActivate:d.get('state')==='pending'&&d.get('honorableResignation')!==true&&
        allowed(req.bpd,byId.get(d.get('discordId'))),
      canActivateInp:d.get('state')==='pending'&&d.get('honorableResignation')===true&&
        allowed(req.bpd,byId.get(d.get('discordId'))),
      previousSpecializationTraining:d.get('honorableResignation')===true?
        honorablePreviousTraining(d.get('snapshot')):[],
      lastHours:Number.isFinite(d.get('snapshot')?.totalHours)?d.get('snapshot').totalHours:null}));
   res.set('Cache-Control','private, no-store');
   return res.json({entries,limited:false});
  }catch(e){return respond(res,e)}
 });
 app.get('/api/personnel-lifecycle/departures',requireUser,async(req,res)=>{
  try{
   const dept=String(req.query.dept||'');
   if(!LIFECYCLE_SERVICES.includes(dept)||
      !canManageLifecycleDepartment(req.bpd,dept))
    throw fail(403,'Geen bevoegdheid tot Discord-controle');
   const snapshot=await getSnapshot();
   if(snapshot.stale)throw fail(503,'Personeelsbron tijdelijk verouderd');
   const upstream=await getBelgiumPdDisplayRoles();
   if(upstream.status!=='ok')throw fail(503,'Discord-ledenlijst niet met zekerheid gecontroleerd');
   const people=snapshot.data.filter(p=>p.dept===dept&&canReadPersonnelLifecycle(req.bpd,p));
   const candidates=possibleDiscordDepartures(people,upstream);
   res.set('Cache-Control','private, no-store');
   return res.json({candidates:candidates.slice(0,100),total:candidates.length,
     limited:candidates.length>100,displayOnly:true,
     warning:'Niet aangetroffen in de API is alleen een signaal, geen automatisch ontslag.'});
  }catch(e){return respond(res,e)}
 });
 app.get('/api/personnel-lifecycle/:dept/:discordId',requireUser,async(req,res)=>{
  try{
   const {dept,discordId}=req.params,person=await resolve(dept,discordId);
   if(!canReadPersonnelLifecycle(req.bpd,person))throw fail(403,'Geen inzagerecht');
   const [entry,audit]=await Promise.all([
    store().doc(dept+'_'+discordId).get(),
    store().doc(dept+'_'+discordId).collection('audit').orderBy('at','desc').limit(25).get()
   ]);
   const d=entry.data()||{};
   res.set('Cache-Control','private, no-store');
   return res.json({state:['archived','pending'].includes(d.state)?d.state:'active',
    revision:Number.isSafeInteger(d.revision)?d.revision:0,
    canManage:allowed(req.bpd,person),
    cause:d.cause||'',cmsRoleSyncPending:d.cmsRoleSyncPending===true,
    honorableResignation:d.honorableResignation===true,
    previousSpecializationTraining:d.honorableResignation===true?
      honorablePreviousTraining(d.snapshot):[],
    lastHours:Number.isFinite(person.hours)?person.hours:null,
    totalHours:Number.isFinite(person.totalHours)?person.totalHours:null,
    lastConnection:person.lastConnection||null,
    history:audit.docs.map(x=>({action:x.get('action'),cause:x.get('cause')||'',
     reason:String(x.get('reason')||'').slice(0,500),
     byDiscordId:x.get('actorDiscordId')||null,
     at:x.get('at')?.toDate?.()?.toISOString?.()||null}))});
  }catch(e){return respond(res,e)}
 });

 // Separate independently approved appointment. The authenticated Discord bot
 // must see a NORMAL Police+Basiskader membership with ALL old cadre and
 // specialist roles removed before an archived officer can become INP.
 app.post('/api/personnel-lifecycle/politie/:discordId/activate-inp',requireUser,async(req,res)=>{
  let input;
  try{input=validateHonorableInpActivation(req.body)}
  catch(e){return respond(res,fail(400,e.message))}
  try{
   const discordId=req.params.discordId;
   const person=await resolve('politie',discordId);
   if(!allowed(req.bpd,person))throw fail(403,
     'Alleen onafhankelijke bevoegde Politieleiding kan deze herinstroom goedkeuren');
   const membership=await verifyGuildAuthorizationRoles(discordId,{cacheResults:false});
   if(membership.status!=='ok')throw fail(409,
     'Actuele Discord-lidmaatschapscontrole via de bot is vereist');
   const ids=new Set(membership.roleIds);
   const POLICE='1309532438053130326',BASIC='1351212180120408166';
   if(!ids.has(POLICE)||!ids.has(BASIC))throw fail(409,
     'Vóór INP-herinstroom moet het lid de politie- en basiskaderrol in Discord hebben');
   const forbidden=new Set([
     '1335578488664490057','1473474238664020151','1562710901080068229',
     ...ROLE_CATALOG.filter(x=>
       x.dept==='politie'&&x.kind==='specialisatie'||
       x.dept==='dispatch'&&x.kind==='specialisatie'
     ).map(x=>x.id)
   ]);
   if([...forbidden].some(id=>ids.has(id)))throw fail(409,
     'Verwijder eerst oude leidinggevende en specialisatie-/instructeursrollen via CMS');
   const roster=await getSnapshot({includeArchived:true});
   if(roster.stale)throw fail(503,'Personeelsbron is niet actueel');
   const duplicate=roster.data.some(p=>p.dept==='politie'&&p.personId!==discordId&&
     !['archived','pending'].includes(p.lifecycleState)&&
     /^(?:S[- ]?)?4\d{2}$/i.test(String(p.call||''))&&
     Number(String(p.call).match(/4\d{2}/)[0])===Number(input.newCall));
   if(duplicate)throw fail(409,'Dit INP-nummer is al in gebruik');
   const lifecycleRef=store().doc('politie_'+discordId);
   const accountRef=db().collection(USER_COLLECTION).doc(discordId);
   const memberAuthRef=db().collection('bpd_discord_auth').doc(discordId);
   const claimStore=db().collection('bpd_personnel_call_claims');
   const claim=claimStore.doc(personnelCallClaimId('politie',input.newCall));
   const aliasClaim=claimStore.doc(personnelCallClaimId('politie','S'+input.newCall));
   const fixedClaim=db().collection('bpd_callsign_reservations').doc(input.newCall);
   const result=await db().runTransaction(async tx=>{
     const [life,user,reserved,alias,fixed]=await Promise.all([
       tx.get(lifecycleRef),tx.get(accountRef),tx.get(claim),
       tx.get(aliasClaim),tx.get(fixedClaim)
     ]);
     if([reserved,alias,fixed].some(doc=>doc.exists&&
       doc.get('discordId')!==discordId))
       throw fail(409,'Roepnummer is al door een andere medewerker gereserveerd');
     if(life.get('state')!=='pending'||life.get('honorableResignation')!==true)
       throw fail(409,'Geen gecontroleerde herinstroom na eervol ontslag gevonden');
     const revision=life.get('revision')||0;
     if(revision!==input.expectedRevision)throw fail(409,'Herlaad het archief: revisie gewijzigd');
     const previous=life.get('snapshot');
     if(!previous||previous.dept!=='politie'||previous.personId!==discordId)
       throw fail(409,'Historisch dossier is niet eenduidig');
     if(user.exists&&user.get('status')==='blocked')
       throw fail(409,'Geblokkeerd portaalaccount vereist afzonderlijke vrijgave');
     const stored=user.exists?user.data():{};
     const priorDepts=Array.isArray(stored.departments)?stored.departments
       .filter(x=>['politie','brandweer','ambulance','depannage','burger'].includes(x)):[];
     const departments=[...new Set([...priorDepts,'politie'])];
     const roleRank={basiskader:1,middenkader:2,officierenkader:3,korpsleiding:4};
     const departmentRoles={};
     for(const dept of departments){
       departmentRoles[dept]=dept==='politie'?'basiskader':
         roleRank[stored.departmentRoles?.[dept]]?stored.departmentRoles[dept]:'basiskader';
     }
     const role=Object.values(departmentRoles).reduce((best,cur)=>
       roleRank[cur]>roleRank[best]?cur:best,'basiskader');
     const at=FieldValue.serverTimestamp();
     const assignment={rank:'Inspecteur',call:input.newCall,series:input.series,
       confirmed:true,at,approvedBy:req.bpd.discordId,
       trainingHistory:honorablePreviousTraining(previous)};
     tx.set(claim,{dept:'politie',discordId,call:input.newCall,
       updatedAt:at},{merge:true});
     tx.set(aliasClaim,{dept:'politie',discordId,call:'S'+input.newCall,
       aliasOf:input.newCall,updatedAt:at},{merge:true});
     tx.set(lifecycleRef,{
       state:'active',revision:revision+1,restoreFromArchive:true,
       honorableInpAssignment:assignment,cmsRoleSyncPending:false,
       restoredAt:at,updatedAt:at,updatedByUid:req.bpd.uid,
       updatedByDiscordId:req.bpd.discordId
     },{merge:true});
     // Replace stale OAuth role evidence with the authoritative just-verified
     // guild member roles. This prevents a cached OLD instructor/cadre role
     // from being used for up to 24 hours after safe INP reinstatement.
     tx.set(memberAuthRef,{guildId:process.env.DISCORD_GUILD_ID,
       roleIds:[...ids],verifiedAt:Date.now()},{merge:true});
     tx.set(accountRef,{
       discordId,status:'approved',departments,departmentRoles,role,
       serviceFunctions:{...(stored.serviceFunctions||{}),politie:'basiskader'},
       approvalSource:'honorable_inp_reentry',
       ...(user.exists?{}:{createdAt:at}),
       approvedAt:at,approvedBy:req.bpd.discordId,updatedAt:at
     },{merge:true});
     tx.create(accountRef.collection('audit').doc(),{
       action:'honorable_inp_reentry',actorDiscordId:req.bpd.discordId,
       department:'politie',role:'basiskader',reason:input.reason,at
     });
     tx.create(lifecycleRef.collection('audit').doc(),{
       action:'honorable_inp_activated',cause:'honorable_resignation',
       previousRank:String(previous.rank||'').slice(0,100),
       newRank:'Inspecteur',newCall:input.newCall,
       reason:input.reason,revision:revision+1,
       actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,at
     });
     // A verified INP reentry is an actual career movement, never only
     // an invisible lifecycle/account audit.
     const eventDate=brusselsEventDate();
     const movementRef=db().collection('bpd_cases').doc('politie_'+discordId)
       .collection('entries').doc();
     const movementNotice=db().collection('bpd_notices').doc('politie')
       .collection('events').doc();
     tx.create(movementRef,{type:'personeelsbeweging',reportCategory:'personeelsbeweging',
       source:'honorable-inp-reentry',dept:'politie',subjectDiscordId:discordId,
       subjectNameAtCreation:String(previous.name||'').slice(0,120),
       subjectCallAtCreation:String(previous.call||'').slice(0,24),
       subjectRankAtCreation:String(previous.rank||'').slice(0,100),
       eventDate,movement:'Herintreding als Inspecteur',
       previousRank:previous.rank||'',newRank:'Inspecteur',
       previousCall:previous.call||'',newCall:input.newCall,
       details:'Herintreding als Inspecteur · '+String(previous.rank||'')+
         ' → Inspecteur · Roepnummer '+String(previous.call||'')+
         ' → '+input.newCall+' · Motivering: '+input.reason,
       registeredBy:{discordId:req.bpd.discordId,name:req.bpd.name||'Bevoegd kader',
         call:req.bpd.call||''},
       submittedBy:{uid:req.bpd.uid,email:req.bpd.email||null},
       createdAt:at,modifiedAt:null});
     tx.create(movementNotice,{caseId:'politie_'+discordId,entryId:movementRef.id,
       type:'personeelsbeweging',dept:'politie',createdAt:at});
     tx.create(db().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
       dossierCaseLogged:true,eventDate,
       type:'personnel_restored',dept:'politie',discordId,
       name:String(previous.name||'').slice(0,120),call:input.newCall,
       before:'Eervol uit dienst',after:'INP · Actief',
       reason:input.reason,actorDiscordId:req.bpd.discordId,at
     });
     return {state:'active',revision:revision+1,rank:'Inspecteur',
       call:input.newCall,series:input.series,
       previousSpecializationTraining:assignment.trainingHistory};
   });
   invalidateLifecycle();invalidateUserAccess(discordId);
   res.set('Cache-Control','private, no-store');
   return res.json({...result,historyPreserved:true,
     oldSpecializationRightsRestored:false,discordRolesChanged:false});
  }catch(e){return respond(res,e)}
 });

 for(const action of ['archive','restore','activate']){
  app.post('/api/personnel-lifecycle/:dept/:discordId/'+action,requireUser,async(req,res)=>{
   const {dept,discordId}=req.params;
   let input;
   try{input=validateLifecycleAction(req.body,action)}catch(e){return respond(res,fail(400,e.message))}
   try{
    const person=await resolve(dept,discordId);
    if(!allowed(req.bpd,person))throw fail(403,'Alleen bevoegde dienstleiding kan dit personeelslid beheren');
    const fullRoster=action==='archive'?await getSnapshot({includeArchived:true}):null;
    if(fullRoster?.stale)throw fail(503,'Personeelsbron niet actueel voor uitdiensthistoriek');
    // Only previously authorized service memberships may be listed.
    const readableServices=fullRoster?
      identityArchiveSubjects(fullRoster.data,discordId):[];
    if(action==='archive'&&readableServices.some(p=>!allowed(req.bpd,p)))
      throw fail(403,'Centrale archivering vereist bevoegdheid voor alle gekoppelde diensten');
    const actorProfile=fullRoster?.data.find(p=>p.personId===req.bpd.discordId&&
      p.dept===dept);
    // Membership loss alone never mutates an operational record. Even when a
    // trusted snapshot omits a member, a human must confirm the transition.
    if(action!=='archive'||input.cause==='voluntary_discord_leave'){
     const upstream=await getBelgiumPdDisplayRoles();
     if(upstream.status!=='ok')throw fail(503,'Discord-ledenstatus niet actueel verifieerbaar');
     const inGuild=upstream.entries.has(discordId);
     if(action!=='archive'&&!inGuild)throw fail(409,'Herintreding kan pas wanneer dit Discord-account terug op de server is');
     if(action==='archive'&&inGuild)
      throw fail(409,'Het Discord-account is nog aanwezig; kies ontslag door leiding of dienstverlating');
    }
    const ref=store().doc(dept+'_'+discordId);
    const result=await db().runTransaction(async tx=>{
     const current=await tx.get(ref),prev=current.data()||{};
     const archivePlan=action==='archive'?await prepareIdentityArchive(tx,db(),{
       subjects:readableServices,primaryDept:dept,discordId}):null;
     const revision=Number.isSafeInteger(prev.revision)?prev.revision:0;
     if(revision!==input.expectedRevision)throw fail(409,'Fiche is intussen gewijzigd. Vernieuw eerst');
     if(action==='archive'&&prev.state==='archived')
      throw fail(409,'Personeelslid is reeds gearchiveerd');
     if(action==='restore'&&prev.state!=='archived')
      throw fail(409,'Deze persoon staat niet in het personeelsarchief');
     if(action==='activate'&&prev.state!=='pending')
      throw fail(409,'Controleer en registreer eerst de herintreding');
     // Never reactivate a historical senior police rank on honorable reentry.
     // A dedicated independently authorised INP placement must precede activation.
     if(action==='activate'&&prev.honorableResignation===true)
      throw fail(409,'Herinstroom na eervol ontslag vereist eerst een afzonderlijk INP-aanstellingsproces. Vorige rangen en specialisatierechten worden niet automatisch hersteld');
     const state=action==='archive'?'archived':action==='restore'?'pending':'active';
     const historic=action==='archive'?lifecycleSourceSnapshot(person):prev.snapshot;
     if(!historic)throw fail(409,'Geen veilig bewaarbaar personeelsprofiel gevonden');
     const departure=action==='archive'?
       departureEvidence(historic,readableServices,input.cause,input.reason):null;
     const data={dept,discordId,state,revision:revision+1,
       snapshot:historic,cause:input.cause,reason:input.reason,
       updatedAt:FieldValue.serverTimestamp(),
       updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId||null,
       // CMS/Discord have separate authority: explicitly queue role review.
       cmsRoleSyncPending:action!=='activate',
       restoreFromArchive:action!=='archive'||prev.restoreFromArchive===true,
       ...(action==='archive'?{archivedAt:FieldValue.serverTimestamp()}:
         action==='restore'?{reentryRequestedAt:FieldValue.serverTimestamp()}:
         {restoredAt:FieldValue.serverTimestamp()})};
     tx.set(ref,data,{merge:true});
     tx.create(ref.collection('audit').doc(),{
       action:action==='archive'?'personnel_archived':action==='restore'?'personnel_reentry_pending':'personnel_restored',
       cause:input.cause,reason:input.reason,revision:revision+1,
       actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
       at:FieldValue.serverTimestamp()
     });
     // Every transition (dismissal, voluntary departure, reentry review,
     // final reactivation) is a distinct immutable dated dossier event.
     const movement=action==='archive'?
       input.cause==='inactive_dismissal'?'Ontslag inactief':
       input.cause==='service_resignation'||input.cause==='voluntary_discord_leave'?
         'Vrijwillig':'Ontslag':
       action==='restore'?'Herintreding in controle':'Herintreding afgerond';
     const previousState=action==='archive'?'Actief':
       action==='restore'?'Uit dienst':'Herintreding in controle';
     const nextState=action==='archive'?'Uit dienst':
       action==='restore'?'Herintreding in controle':'Actief';
     const eventDate=brusselsEventDate();
     const entry=db().collection('bpd_cases').doc(dept+'_'+discordId)
       .collection('entries').doc();
     const notice=db().collection('bpd_notices').doc(dept).collection('events').doc();
     const at=FieldValue.serverTimestamp();
     tx.create(entry,{type:'personeelsbeweging',reportCategory:'personeelsbeweging',
       source:'personnel-lifecycle-'+action,dept,subjectDiscordId:discordId,
       subjectNameAtCreation:historic.name,subjectCallAtCreation:historic.call,
       subjectRankAtCreation:historic.rank||'',
       eventDate,movement,previousRank:historic.rank||'',
       newRank:action==='archive'?'Ontslag':historic.rank||'',
       previousCall:historic.call||'',newCall:action==='archive'?'':historic.call||'',
       ...(departure?{previousSeries:departure.previousSeries,
         previousSpecialties:departure.specialties,
         previousDepartments:departure.departments}:{}),
       details:departure?departure.details:movement+': '+previousState+' → '+nextState+
         '. Motivering: '+input.reason,
       registeredBy:{discordId:req.bpd.discordId,name:actorProfile?.name||
         req.bpd.name||'Bevoegd kader',
         call:actorProfile?.call||req.bpd.call||'',rank:actorProfile?.rank||''},
       submittedBy:{uid:req.bpd.uid,email:req.bpd.email||null},
       createdAt:at,modifiedAt:null});
     tx.create(notice,{caseId:dept+'_'+discordId,entryId:entry.id,
       type:'personeelsbeweging',dept,createdAt:at});
     if(action==='archive'){
       // A removal creates a distinct, truthful activity follow-up entry.
       // NO Discord message is sent automatically and NO automatic departure
       // is ever triggered by a 60-day ping.
       const ping=db().collection('bpd_cases').doc(dept+'_'+discordId)
         .collection('entries').doc();
       const pingNotice=db().collection('bpd_notices').doc(dept)
         .collection('events').doc();
       tx.create(ping,{type:'inactiviteitsping',reportCategory:'inactiviteitsping',
         source:'personnel-lifecycle-archive',dept,
         subjectDiscordId:discordId,subjectNameAtCreation:historic.name,
         subjectCallAtCreation:historic.call,subjectRankAtCreation:historic.rank||'',
         eventDate,createdAt:at,modifiedAt:null,
         activityStatus:'VERWIJDERD',discordPingSent:false,
         archiveReason:input.cause,lifecycleRevision:revision+1,
         details:departure.details,
         registeredBy:{discordId:req.bpd.discordId,name:actorProfile?.name||
           req.bpd.name||'Bevoegd kader',
           call:actorProfile?.call||req.bpd.call||'',rank:actorProfile?.rank||''},
         submittedBy:{uid:req.bpd.uid,email:req.bpd.email||null}});
       tx.create(pingNotice,{caseId:dept+'_'+discordId,entryId:ping.id,
         type:'inactiviteitsping',dept,createdAt:at,
         source:'personnel-lifecycle-archive'});
     }
     tx.create(db().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
       dossierCaseLogged:true,eventDate,
       type:action==='archive'?'personnel_archived':action==='restore'?'personnel_reentry_pending':'personnel_restored',
       dept,discordId,name:historic.name,call:historic.call,
       before:action==='archive'?'Actief':action==='restore'?'Uit dienst':'Herintreding in controle',
       after:action==='archive'?'Uit dienst':action==='restore'?'Herintreding in controle':'Actief',
       cause:input.cause,reason:input.reason,actorDiscordId:req.bpd.discordId||null,
       at:FieldValue.serverTimestamp()
     });
     const cross=archivePlan?writeIdentityArchive(tx,db(),archivePlan,{
       actor:{name:actorProfile?.name||req.bpd.name||'Bevoegd kader',
         call:actorProfile?.call||req.bpd.call||'',
         discordId:req.bpd.discordId},
       actorUid:req.bpd.uid,reason:input.reason,cause:input.cause,
       source:'personnel-lifecycle-archive'}):{};
     return {state,revision:revision+1,...cross};
    });
    invalidateLifecycle();
    res.set('Cache-Control','no-store');
    return res.json({...result,cmsRoleSyncPending:action!=='activate',
     discordRolesChanged:false,historyPreserved:true});
   }catch(e){return respond(res,e)}
  });
 }
}
