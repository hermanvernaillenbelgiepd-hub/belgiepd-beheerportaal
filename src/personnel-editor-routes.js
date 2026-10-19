import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {PERSONNEL_EDITS_COLLECTION,EDITABLE_STATUSES,validPersonnelKey,
  canViewPersonnel,canEditPersonnel,validatePersonnelChange,mergePersonnelEdits,
  personnelCallClaimId} from './personnel-editor-policy.js';
import {CREATED_PERSONNEL_COLLECTION,TEST_RANKS,testCreateEnabled,canCreatePersonnel,
  validateNewPersonnel,uniqueNewPerson} from './personnel-create.js';

const error=(res,status,message)=>res.status(status).json({error:message});
const asTime=x=>x?.toDate?.().toISOString?.()||null;
function safeResponse(res,e){
  if(e?.publicStatus)return error(res,e.publicStatus,e.message);
  console.error('Personeelsbeheer:',e?.code||e?.message||'onbekende fout');
  return error(res,503,'Personeelsbeheer is momenteel niet beschikbaar');
}
function userError(status,message){return Object.assign(new Error(message),{publicStatus:status})}
export function installPersonnelEditorRoutes(app,{requireUser,getSnapshot}){
  const collection=()=>getFirestore().collection(PERSONNEL_EDITS_COLLECTION);
  // Production defaults to read-only; authorized users cannot bypass the flag.
  const writes=()=>process.env.BPD_ENABLE_PERSONNEL_WRITES==='true';
  app.get('/api/personnel/overview',requireUser,async(req,res)=>{
    try {
      const allowed=req.bpd.departments.filter(d=>canViewPersonnel(req.bpd,d));
      if(!allowed.length)return error(res,403,'Je hebt geen kaderrechten voor personeelsbeheer');
      const [snapshot,edits]=await Promise.all([getSnapshot(),collection().limit(400).get()]);
      const base=snapshot.data.filter(p=>allowed.includes(p.dept));
      const overlay=edits.docs.map(d=>d.data());
      const records=mergePersonnelEdits(base,overlay).map(p=>{
        const edit=overlay.find(e=>e.dept===p.dept&&e.discordId===p.personId);
        return {discordId:p.personId,dept:p.dept,name:p.name,call:p.call,rank:p.rank,
          series:p.series,status:p.status,revision:Number.isSafeInteger(edit?.revision)?edit.revision:0,
          source:edit?'firestore-overlay':p.source==='firestore-created'?'firestore-created':'google-sheets',
          canEdit:canEditPersonnel(req.bpd,p)};
      });
      return res.json({records,role:req.bpd.role,departments:allowed,
        writesEnabled:writes(),createEnabled:testCreateEnabled(process.env)&&writes(),
        createRanks:Object.fromEntries(allowed.filter(dept=>canCreatePersonnel(req.bpd,dept)).map(dept=>[dept,TEST_RANKS[dept]])),
        overridesActive:process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true',
        sourceStale:snapshot.stale,limited:edits.size===400,statuses:EDITABLE_STATUSES});
    }catch(e){return safeResponse(res,e)}
  });
  // Fictitious personnel intake: explicitly isolated to the TEST Firebase project.
  // Creating a personnel row never creates Firebase users, Discord roles or portal access.
  app.post('/api/personnel/new',requireUser,async(req,res)=>{
    if(!writes()||!testCreateEnabled(process.env))
      return error(res,503,'Nieuwe personeelsleden toevoegen staat alleen op de geïsoleerde TESTSERVER aan');
    let proposed;
    try{proposed=validateNewPersonnel(req.body)}catch(e){return error(res,400,e.message)}
    if(!canCreatePersonnel(req.bpd,proposed.dept))
      return error(res,403,'Geen bevoegdheid om personeelsleden in deze hulpdienst aan te maken');
    try{
      const snap=await getSnapshot();
      try{uniqueNewPerson(snap.data,proposed)}
      catch(e){return error(res,409,e.message)}
      const store=getFirestore();
      const ref=store.collection(CREATED_PERSONNEL_COLLECTION)
        .doc(proposed.dept+'_'+proposed.discordId);
      const claim=store.collection('bpd_personnel_call_claims')
        .doc(personnelCallClaimId(proposed.dept,proposed.call));
      await store.runTransaction(async tx=>{
        const [existing,reserved]=await Promise.all([tx.get(ref),tx.get(claim)]);
        if(existing.exists)throw userError(409,'Deze personeelsfiche bestaat al');
        if(reserved.exists)throw userError(409,'Roepnummer reeds gereserveerd');
        const doc={dept:proposed.dept,discordId:proposed.discordId,
          name:proposed.name,call:proposed.call,rank:proposed.rank,
          status:'In opleiding',revision:0,createdByUid:req.bpd.uid,
          createdByDiscordId:req.bpd.discordId||null,
          createdAt:FieldValue.serverTimestamp()};
        tx.create(ref,doc);
        tx.create(claim,{dept:proposed.dept,discordId:proposed.discordId,
          call:proposed.call,updatedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{action:'create',
          next:{name:proposed.name,call:proposed.call,rank:proposed.rank,
            status:'In opleiding'},revision:0,reason:proposed.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()});
      });
      return res.status(201).json({created:true,discordId:proposed.discordId,
        dept:proposed.dept});
    }catch(e){return safeResponse(res,e)}
  });
  app.post('/api/personnel/:dept/:discordId',requireUser,async(req,res)=>{
    if(!validPersonnelKey(req.params.dept,req.params.discordId))return error(res,400,'Ongeldige hulpdienst of Discord ID');
    if(!writes())return error(res,503,'Personeelswijzigingen staan nog uit. Test de module eerst veilig.');
    let proposed;
    try{proposed=validatePersonnelChange(req.body);}catch(e){return error(res,400,e.message)}
    try{
      const snap=await getSnapshot();
      const matches=snap.data.filter(p=>p.dept===req.params.dept&&p.personId===req.params.discordId);
      if(matches.length!==1)throw userError(409,'Geen eenduidige bestaande personeelsfiche gevonden');
      const subject=matches[0];
      if(!canEditPersonnel(req.bpd,subject))throw userError(403,'Je mag deze personeelsfiche niet wijzigen');
      if(snap.data.some(p=>p.dept===subject.dept&&p.personId!==subject.personId&&
        p.call===proposed.call))throw userError(409,'Dit roepnummer wordt al gebruikt binnen deze hulpdienst');
      if(subject.name===proposed.name&&subject.call===proposed.call&&subject.status===proposed.status)
        throw userError(409,'Er zijn geen wijzigingen ten opzichte van de huidige personeelsfiche');
      const ref=collection().doc(subject.dept+'_'+subject.personId);
      await getFirestore().runTransaction(async tx=>{
        const existing=await tx.get(ref);
        const current=existing.exists?existing.data():null;
        const revision=current?.revision||0;
        if(revision!==proposed.expectedRevision)throw userError(409,'Deze fiche is intussen gewijzigd. Vernieuw de pagina.');
        const oldCall=current?.call??subject.call;
        const claims=getFirestore().collection('bpd_personnel_call_claims');
        const newClaim=claims.doc(personnelCallClaimId(subject.dept,proposed.call));
        const oldClaim=claims.doc(personnelCallClaimId(subject.dept,oldCall));
        const reserved=await tx.get(newClaim);
        if(reserved.exists&&reserved.get('discordId')!==subject.personId)
          throw userError(409,'Dit roepnummer is intussen gereserveerd voor een ander personeelslid');
        const previousClaim=oldCall===proposed.call?reserved:await tx.get(oldClaim);
        const audit=ref.collection('audit').doc();
        const previous={name:current?.name??subject.name,call:oldCall,status:current?.status??subject.status};
        const next={name:proposed.name,call:proposed.call,status:proposed.status};
        tx.set(ref,{...next,dept:subject.dept,discordId:subject.personId,revision:revision+1,
          updatedAt:FieldValue.serverTimestamp(),updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId});
        tx.set(newClaim,{discordId:subject.personId,dept:subject.dept,call:proposed.call,updatedAt:FieldValue.serverTimestamp()});
        if(oldCall!==proposed.call&&previousClaim.exists&&previousClaim.get('discordId')===subject.personId)
          tx.delete(oldClaim);
        tx.create(audit,{previous,next,revision:revision+1,reason:proposed.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,status:'saved',active:process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true'});
    }catch(e){return safeResponse(res,e)}
  });
  app.get('/api/personnel/:dept/:discordId/history',requireUser,async(req,res)=>{
    if(!validPersonnelKey(req.params.dept,req.params.discordId))return error(res,400,'Ongeldige hulpdienst of Discord ID');
    if(!canViewPersonnel(req.bpd,req.params.dept))return error(res,403,'Geen toegang tot deze hulpdienst');
    try{
      const snap=await getSnapshot();
      if(!snap.data.some(p=>p.dept===req.params.dept&&p.personId===req.params.discordId))
        return error(res,404,'Personeelsfiche niet gevonden');
      const log=await collection().doc(req.params.dept+'_'+req.params.discordId)
        .collection('audit').orderBy('at','desc').limit(25).get();
      return res.json({changes:log.docs.map(d=>{
        const e=d.data();
        return {revision:e.revision,previous:e.previous,next:e.next,
          reason:e.reason,at:asTime(e.at),actorDiscordId:e.actorDiscordId||null};
      })});
    }catch(e){return safeResponse(res,e)}
  });
}
