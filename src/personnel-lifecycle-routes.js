import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {PERSONNEL_LIFECYCLE_COLLECTION,lifecycleKey,validateLifecycleAction,
 lifecycleSourceSnapshot,possibleDiscordDepartures} from './personnel-lifecycle-policy.js';
import {canReadPersonnelSubject,canEditPersonnel,canViewPersonnel} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
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
 const allowed=(actor,person)=>canReadPersonnelSubject(actor,person)&&
   canEditPersonnel(actor,person)&&actor.discordId!==person.personId;
 const resolve=async(dept,id)=>{
  const key=lifecycleKey(dept,id);
  if(!key)throw fail(400,'Ongeldige dienst of Discord ID');
  const snap=await getSnapshot({includeArchived:true});
  if(snap.stale)throw fail(503,'Personeelsbron niet actueel; probeer later');
  const persons=snap.data.filter(p=>p.dept===dept&&p.personId===id);
  if(persons.length!==1)throw fail(409,'Geen eenduidige personeelsfiche; controleer eerst de bron');
  return persons[0];
 };
 app.get('/api/personnel-lifecycle/archives',requireUser,async(req,res)=>{
  try{
   const dept=String(req.query.dept||'');
   if(!['politie','brandweer','ambulance','depannage'].includes(dept)||
      !canViewPersonnel(req.bpd,dept)||!canReadServiceDossier(req.bpd,dept))
    throw fail(403,'Geen bevoegdheid tot dit personeelsarchief');
   const [records,snapshot]=await Promise.all([
     store().where('dept','==',dept).limit(600).get(),
     getSnapshot({includeArchived:true})
   ]);
   if(records.size===600)throw fail(503,'Archief is te groot voor veilige weergave');
   const byId=new Map(snapshot.data.filter(p=>p.dept===dept).map(p=>[p.personId,p]));
   const entries=records.docs.filter(d=>['archived','pending'].includes(d.get('state')))
    .filter(d=>{const p=byId.get(d.get('discordId'));return p&&canReadPersonnelSubject(req.bpd,p)})
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
   if(!['politie','brandweer','ambulance','depannage'].includes(dept)||
      !canViewPersonnel(req.bpd,dept)||!canReadServiceDossier(req.bpd,dept))
    throw fail(403,'Geen bevoegdheid tot Discord-controle');
   const snapshot=await getSnapshot();
   if(snapshot.stale)throw fail(503,'Personeelsbron tijdelijk verouderd');
   const upstream=await getBelgiumPdDisplayRoles();
   if(upstream.status!=='ok')throw fail(503,'Discord-ledenlijst niet met zekerheid gecontroleerd');
   const people=snapshot.data.filter(p=>p.dept===dept&&canReadPersonnelSubject(req.bpd,p));
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
   if(!canReadPersonnelSubject(req.bpd,person))throw fail(403,'Geen inzagerecht');
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
