import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {eligibility,isDiscordId} from './callsign-utils.js';
import {verifiedDiscordIdentity,USER_COLLECTION} from './user-access.js';
import {actorFromPersonnel} from './registrations.js';
import {CREATED_PERSONNEL_COLLECTION,personnelDataEnabled} from './personnel-create.js';
import {STAFF_DOSSIER_COLLECTION} from './staff-dossier-policy.js';
import {
  applicantRequest,canInspect,canAssign,claimedCalls,availableCalls,proposedCall,
  claimId,existingApplicant,fixedCall,intakeReady,portalReady,POLICE_RANK,POLICE_STATUS
} from './callsign-portal-policy.js';
const enabled=()=>intakeReady(process.env);
const fail=(res,e)=>{
  if(e?.httpStatus)return res.status(e.httpStatus).json({error:e.message});
  console.error('Vaste roepnummers:',e?.code||e?.message||'onbekend');
  return res.status(503).json({error:'Roepnummeradministratie niet beschikbaar. Er is niets toegewezen.'});
};
const reject=(code,message)=>Object.assign(new Error(message),{httpStatus:code});
const stamp=x=>x?.toDate?.().toISOString?.()||null;
const rows=snaps=>snaps.docs.map(d=>({...d.data(),id:d.id}));
export function installCallsignRoutes(app,{requireUser,getSnapshot,onPersonnelChanged=()=>{},firestore=()=>getFirestore(),authentication=()=>getAuth()}){
  // Injectable services are used only by deterministic, isolated integration tests.
  const db=firestore;
  const requests=()=>db().collection('bpd_callsign_requests');
  const by=async req=>actorFromPersonnel(req.bpd,(await getSnapshot()).data);

  // Self-service intentionally bypasses privileged portal access, NOT Discord authentication.
  // The applicant receives no dossier, cadre or personnel-edit permissions.
  async function discordApplicant(req,res,next){
    if(!enabled())return res.status(503).json({error:'Aanvragen vereisen de geïsoleerde TEST-database en een geactiveerde aanvraagmodule'});
    if(process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN!=='true')
      return res.status(503).json({error:'Geverifieerde Discord-login is nog niet ingeschakeld'});
    const token=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
    if(!token)return res.status(401).json({error:'Meld je eerst aan via Discord'});
    try{
      const verified=await authentication().verifyIdToken(token);
      const id=String(verified.uid||'').replace(/^discord:/,'');
      if(!isDiscordId(id))return res.status(403).json({error:'Discord-login vereist'});
      const [member,user]=await Promise.all([
        db().collection('bpd_discord_auth').doc(id).get(),
        db().collection(USER_COLLECTION).doc(id).get()
      ]);
      // An explicitly blocked user cannot bypass their block via the intake module.
      if(user.exists&&user.get('status')==='blocked')
        return res.status(403).json({error:'Dit account is geblokkeerd'});
      const identity=verifiedDiscordIdentity(verified,member.data(),process.env.DISCORD_GUILD_ID);
      if(!identity)return res.status(403).json({error:'Discord-verificatie verlopen. Meld je opnieuw aan'});
      req.bpdApplicant={discordId:identity,memberName:String(member.get('username')||'').slice(0,80)};
      next();
    }catch(e){return res.status(401).json({error:'Ongeldige Discord-aanmelding'});}
  }

  async function freshRoster(){
    const snap=await getSnapshot({forceRefresh:true});
    if(snap.stale||!Array.isArray(snap.data))throw reject(503,'Bestaande personeelsnummers kunnen niet betrouwbaar gecontroleerd worden');
    return snap.data;
  }
  async function available(roster){
    const [primary,legacy]=await Promise.all([
      db().collection('bpd_personnel_call_claims').where('dept','==','politie').limit(1001).get(),
      db().collection('bpd_callsign_reservations').limit(1001).get()
    ]);
    if(primary.size>=1001||legacy.size>=1001)
      throw reject(503,'De nummerreservaties moeten eerst administratief gecontroleerd worden');
    return availableCalls(claimedCalls(roster,rows(primary),rows(legacy)));
  }
  const safeRequest=x=>({
    discordId:x.discordId,name:x.name,temporaryCall:x.temporaryCall,
    preferredCall:x.preferredCall??null,status:x.status,assignedCall:x.assignedCall??null,
    joinedOn:x.verification?.joinedOn||null,playHours:x.verification?.playHours??null,
    createdAt:stamp(x.createdAt),verifiedBy:x.verification?.by?.name||null
  });
  const responseRequests=async()=>rows(await requests().orderBy('createdAt','desc').limit(80).get()).map(safeRequest);

  // A recruit may see/create ONLY their own request. IDs come from verified Firebase custom tokens.
  app.get('/api/callsigns/self',discordApplicant,async(req,res)=>{
    try{
      const d=await requests().doc(req.bpdApplicant.discordId).get();
      return res.json({applicant:req.bpdApplicant,request:d.exists?safeRequest(d.data()):null});
    }catch(e){return fail(res,e);}
  });
  app.post('/api/callsigns/self',discordApplicant,async(req,res)=>{
    try{
      const subject=applicantRequest(req.body,req.bpdApplicant.discordId);
      const roster=await freshRoster();
      if(existingApplicant(roster,subject.discordId,subject.name))
        return res.status(409).json({error:'Je hebt al een politiepersoneelsfiche of deze naam bestaat reeds'});
      // The preferred number is a wish, NOT a reservation before officer approval.
      const free=await available(roster);
      if(subject.preferredCall!==null&&!free.includes(subject.preferredCall))
        return res.status(409).json({error:'Het gewenste nummer is momenteel bezet'});
      const record={...subject,status:'submitted',origin:'discord_self',
        submittedByDiscordId:subject.discordId,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
      await requests().doc(subject.discordId).create(record);
      return res.status(201).json({created:true,status:'submitted'});
    }catch(e){
      if(e.code===6||e.code==='already-exists')return res.status(409).json({error:'Je hebt al een aanvraag; vraag het kader om deze te behandelen'});
      if(/Ongeldige|roepnummer|naam|Discord-identiteit/i.test(e.message)&&!e.httpStatus)
        return res.status(400).json({error:e.message});
      return fail(res,e);
    }
  });
  app.get('/api/callsigns/self/available',discordApplicant,async(_req,res)=>{
    try{return res.json({available:await available(await freshRoster())});}
    catch(e){return fail(res,e);}
  });

  // Privileged cadre routes. The personal route above grants NO elevated access.
  app.get('/api/callsigns/settings',requireUser,(req,res)=>{
    if(!canInspect(req.bpd))return res.status(403).json({error:'Geen politiekaderrechten'});
    res.json({role:req.bpd.role,requestsEnabled:enabled(),sheetSyncEnabled:false,
      portalApprovalEnabled:portalReady(process.env)&&personnelDataEnabled(process.env),
      canApprove:canAssign(req.bpd),mode:'firestore_only'});
  });
  app.get('/api/callsigns/requests',requireUser,async(req,res)=>{
    if(!canInspect(req.bpd))return res.status(403).json({error:'Geen inzagerecht'});
    try{return res.json({requests:await responseRequests()});}
    catch(e){return fail(res,e);}
  });
  app.get('/api/callsigns/available',requireUser,async(req,res)=>{
    if(!canInspect(req.bpd))return res.status(403).json({error:'Geen inzagerecht'});
    try{return res.json({available:await available(await freshRoster())});}
    catch(e){return fail(res,e);}
  });
  app.post('/api/callsigns/requests',requireUser,async(req,res)=>{
    if(!canInspect(req.bpd))return res.status(403).json({error:'Geen bevoegdheid'});
    if(!enabled())return res.status(503).json({error:'Aanvraagmodule staat nog uit'});
    let request;
    try{request=applicantRequest(req.body,req.body?.discordId);}
    catch(e){return res.status(400).json({error:e.message});}
    try{
      const roster=await freshRoster();
      if(existingApplicant(roster,request.discordId,request.name))
        return res.status(409).json({error:'Deze speler bestaat al in politiepersoneelsbeheer'});
      if(request.preferredCall!==null&&!(await available(roster)).includes(request.preferredCall))
        return res.status(409).json({error:'Dit roepnummer is niet vrij'});
      const officer=await by(req);
      if(!officer)return res.status(403).json({error:'Koppel je kaderaccount eerst aan een personeelsfiche'});
      await requests().doc(request.discordId).create({...request,status:'submitted',
        origin:'cadre',submittedBy:officer,submittedUid:req.bpd.uid,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      return res.status(201).json({created:true,discordId:request.discordId,status:'submitted'});
    }catch(e){
      if(e.code===6||e.code==='already-exists')
        return res.status(409).json({error:'Voor deze Discord-ID bestaat al een aanvraag'});
      return fail(res,e);
    }
  });
  app.post('/api/callsigns/requests/:discordId/verify',requireUser,async(req,res)=>{
    if(!canInspect(req.bpd))return res.status(403).json({error:'Geen controlebevoegdheid'});
    if(!enabled())return res.status(503).json({error:'Aanvraagmodule staat uit'});
    if(!isDiscordId(req.params.discordId))return res.status(400).json({error:'Ongeldige Discord ID'});
    let result;
    try{result=eligibility(req.body||{});}catch(e){return res.status(400).json({error:e.message});}
    try{
      const reviewer=await by(req);
      if(!reviewer)return res.status(403).json({error:'Geen gekoppeld kaderlid'});
      const ref=requests().doc(req.params.discordId);
      await db().runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists||!['submitted','needs_verification','verified'].includes(current.get('status')))
          throw reject(409,'Aanvraag ontbreekt of is al behandeld');
        tx.update(ref,{status:result.eligible?'verified':'needs_verification',
          verification:{...result,source:'/info member, door kader handmatig bevestigd',
            by:reviewer,byUid:req.bpd.uid,checkedAt:new Date().toISOString()},
          updatedAt:FieldValue.serverTimestamp()});
      });
      return res.json({verified:result.eligible,...result});
    }catch(e){return fail(res,e);}
  });
  app.post('/api/callsigns/requests/:discordId/reject',requireUser,async(req,res)=>{
    if(!canAssign(req.bpd))return res.status(403).json({error:'Beslissing uitsluitend voor officierenkader of korpsleiding'});
    if(!enabled())return res.status(503).json({error:'Aanvraagmodule staat uit'});
    const id=req.params.discordId,reason=String(req.body?.reason||'').trim();
    if(!isDiscordId(id)||reason.length<8||reason.length>1000)
      return res.status(400).json({error:'Reden (8–1000 tekens) en Discord-ID vereist'});
    try{
      const officer=await by(req);
      if(!officer)return res.status(403).json({error:'Geen gekoppeld kaderlid'});
      await db().runTransaction(async tx=>{
        const ref=requests().doc(id),current=await tx.get(ref);
        if(!current.exists||!['submitted','needs_verification','verified'].includes(current.get('status')))
          throw reject(409,'Aanvraag is al verwerkt');
        tx.update(ref,{status:'rejected',decision:{type:'afgewezen',reason,by:officer,
          byUid:req.bpd.uid,at:new Date().toISOString()},
          updatedAt:FieldValue.serverTimestamp()});
      });
      return res.json({rejected:true});
    }catch(e){return fail(res,e);}
  });
  app.get('/api/callsigns/requests/:discordId/preview',requireUser,async(req,res)=>{
    if(!canAssign(req.bpd))return res.status(403).json({error:'Geen goedkeuringsrecht'});
    if(!isDiscordId(req.params.discordId))return res.status(400).json({error:'Ongeldige Discord-ID'});
    try{
      const r=await requests().doc(req.params.discordId).get();
      if(!r.exists||r.get('status')!=='verified')
        return res.status(409).json({error:'De aanvraag moet eerst gecontroleerd zijn'});
      const roster=await freshRoster();
      if(existingApplicant(roster,req.params.discordId,r.get('name')))
        return res.status(409).json({error:'Er bestaat al een politiepersoneelsfiche of dezelfde naam'});
      const free=await available(roster);
      const requested=req.query.preferredCall??r.get('preferredCall')??null;
      const call=proposedCall(free,requested);
      return res.json({preview:{name:r.get('name'),call,discordId:req.params.discordId,
        rank:POLICE_RANK,remainingFree:free.length,source:'firestore',series:'200–299'},
        portalApprovalEnabled:portalReady(process.env)&&personnelDataEnabled(process.env)});
    }catch(e){
      if(/vrij|roepnummer/.test(e.message)&&!e.httpStatus)return res.status(409).json({error:e.message});
      return fail(res,e);
    }
  });
  app.post('/api/callsigns/requests/:discordId/approve',requireUser,async(req,res)=>{
    if(!canAssign(req.bpd))return res.status(403).json({error:'Geen goedkeuringsrecht'});
    if(!enabled()||!portalReady(process.env)||!personnelDataEnabled(process.env))
      return res.status(503).json({error:'Firestore-toekenning of dossierregistratie staat nog uit. Sheets wordt niet gewijzigd'});
    const id=req.params.discordId;
    if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord-ID'});
    let requested;
    try{requested=fixedCall(req.body?.preferredCall,{optional:true});}
    catch(e){return res.status(400).json({error:e.message});}
    try{
      const ref=requests().doc(id),current=await ref.get();
      if(!current.exists||current.get('status')!=='verified')
        return res.status(409).json({error:'Aanvraag is niet gecontroleerd of reeds verwerkt'});
      const roster=await freshRoster();
      if(existingApplicant(roster,id,current.get('name')))
        return res.status(409).json({error:'Een politiepersoneelsfiche of personeelsnaam bestaat al'});
      const free=await available(roster);
      const call=proposedCall(free,requested??current.get('preferredCall')??null);
      const officer=await by(req);
      if(!officer)return res.status(403).json({error:'Goedkeurder heeft geen gekoppeld personeelsdossier'});
      const store=db(),person=store.collection(CREATED_PERSONNEL_COLLECTION).doc('politie_'+id),
        dossier=store.collection(STAFF_DOSSIER_COLLECTION).doc('politie_'+id),
        caseRef=store.collection('bpd_cases').doc('politie_'+id),
        primary=store.collection('bpd_personnel_call_claims').doc(claimId(call)),
        legacy=store.collection('bpd_callsign_reservations').doc(String(call)),
        audit=person.collection('audit').doc(),staffAudit=dossier.collection('audit').doc();
      // All identity, claims, case and dossier records are written atomically.
      await store.runTransaction(async tx=>{
        const [application,used,oldReserved,existing,existingDossier,existingCase]=await Promise.all([
          tx.get(ref),tx.get(primary),tx.get(legacy),tx.get(person),tx.get(dossier),tx.get(caseRef)
        ]);
        if(!application.exists||application.get('status')!=='verified')
          throw reject(409,'Aanvraag is intussen behandeld');
        if(used.exists||oldReserved.exists)
          throw reject(409,'Roepnummer is intussen gereserveerd. Kies opnieuw');
        if(existing.exists||existingDossier.exists||existingCase.exists)
          throw reject(409,'Er bestaat al een dossier of personeelsfiche voor deze Discord-ID');
        if(application.get('name')!==current.get('name'))
          throw reject(409,'Naam is intussen gewijzigd. Vernieuw de aanvraag');
        const now=FieldValue.serverTimestamp();
        tx.create(primary,{dept:'politie',discordId:id,call:String(call),source:'vast_roeppnummer',updatedAt:now});
        tx.create(legacy,{discordId:id,call:String(call),source:'firestore_portaal',approvedBy:officer,createdAt:now});
        tx.create(person,{dept:'politie',discordId:id,name:application.get('name'),
          call:String(call),rank:POLICE_RANK,status:POLICE_STATUS,state:'linked',
          revision:0,entryRank:POLICE_RANK,exceptionalEntryRank:false,
          createdFrom:'vaste_roepnummer_aanvraag',createdByUid:req.bpd.uid,
          createdByDiscordId:req.bpd.discordId||null,createdAt:now});
        tx.create(dossier,{dept:'politie',discordId:id,revision:0,
          profile:{startDate:'',unit:'',functionTitle:''},
          createdFrom:'vaste_roepnummer_aanvraag',createdAt:now,updatedAt:now});
        tx.create(caseRef,{dept:'politie',discordId:id,name:application.get('name'),
          call:String(call),rank:POLICE_RANK,createdFrom:'vaste_roepnummer_aanvraag',createdAt:now});
        tx.create(audit,{action:'entry_rank',previousRank:null,newRank:POLICE_RANK,
          reason:'Vast roepnummer toegekend',call:String(call),actorUid:req.bpd.uid,
          actorDiscordId:req.bpd.discordId||null,at:now});
        tx.create(staffAudit,{action:'callsign_assigned',call:String(call),
          previousCall:application.get('temporaryCall')||null,
          reason:'Goedgekeurde aanvraag',actorDiscordId:req.bpd.discordId||null,at:now});
        tx.update(ref,{status:'approved',assignedCall:call,approvedBy:officer,
          approvedUid:req.bpd.uid,approvedAt:now,updatedAt:now});
      });
      onPersonnelChanged();
      return res.json({approved:true,call,discordId:id,createdPersonnel:true,
        createdPoliceDossier:true,sheetsChanged:false});
    }catch(e){
      if(/vrij|roepnummer/.test(e.message)&&!e.httpStatus)return res.status(409).json({error:e.message});
      return fail(res,e);
    }
  });
}
