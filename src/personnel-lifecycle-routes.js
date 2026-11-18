import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {PERSONNEL_LIFECYCLE_COLLECTION,LIFECYCLE_SERVICES,lifecycleKey,validateLifecycleAction,
 lifecycleSourceSnapshot,possibleDiscordDepartures,HONORABLE_REQUEST_COLLECTION,
 validateHonorableRequest,validateHonorableDecision} from './personnel-lifecycle-policy.js';
import {canManageLifecycleDepartment,canReadPersonnelLifecycle,
 canManagePersonnelLifecycle} from './personnel-lifecycle-access.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {getBelgiumPdDisplayRoles} from './bpd-discord-users-display.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const respond=(res,e)=>{
 if(e?.status)return res.status(e.status).json({error:e.message});
 console.error('Personeelsarchief:',e?.code||'unknown');
 return res.status(503).json({error:'Personeelsarchief momenteel niet beschikbaar'});
};
export function installPersonnelLifecycleRoutes(app,{requireUser,getSnapshot,invalidateLifecycle}){
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
   const result=await db().runTransaction(async tx=>{
    const [request,life]=await Promise.all([tx.get(requestRef),tx.get(stateRef)]);
    if(request.get('status')!=='pending')
      throw fail(409,'Geen openstaande aanvraag voor dit personeelslid');
    if(approved&&['archived','pending'].includes(life.get('state')))
      throw fail(409,'Personeelslid is reeds uit dienst of in herinstroom');
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
        cmsRoleSyncPending:true,restoreFromArchive:false},{merge:true});
      tx.create(stateRef.collection('audit').doc(),{
        action:'honorable_resignation_approved',cause:'honorable_resignation',
        reason:input.reason,actorDiscordId:req.bpd.discordId,at,
        revision:revision+1});
      tx.create(db().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
        type:'personnel_archived',dept:'politie',discordId,
        name:historic.name,call:historic.call,
        before:'Actief',after:'Eervol uit dienst',cause:'honorable_resignation',
        reason:input.reason,actorDiscordId:req.bpd.discordId,at});
    }
    return {status:approved?'approved':'rejected',
      archived:approved,cmsRoleSyncPending:approved};
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
      canActivate:d.get('state')==='pending'&&allowed(req.bpd,byId.get(d.get('discordId'))),
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
    lastHours:Number.isFinite(person.hours)?person.hours:null,
    totalHours:Number.isFinite(person.totalHours)?person.totalHours:null,
    lastConnection:person.lastConnection||null,
    history:audit.docs.map(x=>({action:x.get('action'),cause:x.get('cause')||'',
     reason:String(x.get('reason')||'').slice(0,500),
     byDiscordId:x.get('actorDiscordId')||null,
     at:x.get('at')?.toDate?.()?.toISOString?.()||null}))});
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
     const revision=Number.isSafeInteger(prev.revision)?prev.revision:0;
     if(revision!==input.expectedRevision)throw fail(409,'Fiche is intussen gewijzigd. Vernieuw eerst');
     if(action==='archive'&&prev.state==='archived')
      throw fail(409,'Personeelslid is reeds gearchiveerd');
     if(action==='restore'&&prev.state!=='archived')
      throw fail(409,'Deze persoon staat niet in het personeelsarchief');
     if(action==='activate'&&prev.state!=='pending')
      throw fail(409,'Controleer en registreer eerst de herintreding');
     const state=action==='archive'?'archived':action==='restore'?'pending':'active';
     const historic=action==='archive'?lifecycleSourceSnapshot(person):prev.snapshot;
     if(!historic)throw fail(409,'Geen veilig bewaarbaar personeelsprofiel gevonden');
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
     tx.create(db().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
       type:action==='archive'?'personnel_archived':action==='restore'?'personnel_reentry_pending':'personnel_restored',
       dept,discordId,name:historic.name,call:historic.call,
       before:action==='archive'?'Actief':action==='restore'?'Uit dienst':'Herintreding in controle',
       after:action==='archive'?'Uit dienst':action==='restore'?'Herintreding in controle':'Actief',
       cause:input.cause,reason:input.reason,actorDiscordId:req.bpd.discordId||null,
       at:FieldValue.serverTimestamp()
     });
     return {state,revision:revision+1};
    });
    invalidateLifecycle();
    res.set('Cache-Control','no-store');
    return res.json({...result,cmsRoleSyncPending:action!=='activate',
     discordRolesChanged:false,historyPreserved:true});
   }catch(e){return respond(res,e)}
  });
 }
}
