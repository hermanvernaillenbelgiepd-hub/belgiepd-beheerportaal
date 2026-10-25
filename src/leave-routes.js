import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {USER_COLLECTION,approvedManagedEntry} from './user-access.js';
import {calendarDays,validDiscordId,validateLeaveRequest,validateManualLeaveRequest,rosterPoliceRole,
  mayRegisterCentralManualLeave,mayApproveLeave,
  mayManageGrants,highCadreDepartments,leaveGrantDepartments,mayReviewLeaveNotifications,
  validateGrant,activeGrant,roleForDepartment,leaveSubmissionStatus,leaveApplicantIsCorps} from './leave-policy.js';
import {verifyBoardDiscordRole} from './dossier-grants.js';
import {activeBoardAppointment} from './board-appointment-policy.js';
import {leaveCanWithdraw,leaveCanReapply,writeLeaveEvent} from './leave-event-log.js';
import {actorFromPersonnel} from './registrations.js';
import {canRetireDossierRecord} from './dossier-retirement-policy.js';

const coll='bpd_leave_requests';
const grants='bpd_leave_grants';
const stamp=()=>new Date().toISOString();
const yyyyMmDd=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const jsonError=(res,e)=>{
  if(e?.userError)return res.status(e.status||400).json({error:e.message});
  console.error('Verlofmodule:',e?.code||e?.message||'onbekende fout');
  return res.status(503).json({error:'Verlofmodule tijdelijk niet beschikbaar'});
};
const rejection=(message,status=400)=>Object.assign(new Error(message),{userError:true,status});
const validId=s=>/^[A-Za-z0-9_-]{12,200}$/.test(String(s||''));
const iso=t=>t?.toDate?.().toISOString?.()||null;
const item=(doc,showNote=false)=>{
  const d=doc.data();
  return {id:doc.id,personDiscordId:d.personDiscordId,subjectName:d.subjectName,
    subjectDepartments:d.subjectDepartments||[],startDate:d.startDate,endDate:d.endDate,
    days:d.days,status:d.status,canWithdraw:leaveCanWithdraw(d,yyyyMmDd()),
    createdAt:iso(d.createdAt),decidedAt:iso(d.decidedAt),withdrawnAt:iso(d.withdrawnAt),
    ...(showNote?{note:d.note||''}:{})};
};
const personRecords=(rows,id)=>rows.filter(p=>p.personId===id);
const departmentsOf=records=>[...new Set(records.map(p=>p.dept).filter(Boolean))];
// Geen volwaardige centrale personeelsnummerdatabase in dit project: Discord ID is
// voorlopig de migratiebrug. Een toekomstig BPD-nummer mag deze sleutel niet vervangen.
export function installLeaveRoutes(app,{requireUser,requireDossierUser=requireUser,getSnapshot,accessList}){
  const db=()=>getFirestore();
  const writes=()=>process.env.BPD_ENABLE_LEAVE_WRITES==='true';
  const requireWrites=(req,res,next)=>writes()?next():res.status(503).json({error:'Verlofmodule is voorlopig alleen voor testen. Schrijfacties staan uit.'});
  async function context(req){
    const id=req.bpd?.discordId;
    if(!validDiscordId(id))throw rejection('Koppel je Google-account eerst aan je eigen Discord ID',403);
    const snapshot=await getSnapshot();
    const records=personRecords(snapshot.data,id);
    if(!records.length||!records.some(p=>req.bpd.departments.includes(p.dept)))
      throw rejection('Je personeelskoppeling is niet gevonden in je gemachtigde hulpdiensten',403);
    return {records,snapshot:snapshot.data,departments:departmentsOf(records)};
  }
  // Only verified Board members (Discord role or approved appointment)
  // and appropriately ranked service cadre may manage leave grants.
  async function grantManagerScope(actor){
    if(!validDiscordId(actor?.discordId))return [];
    if(actor.role==='beheerder')return leaveGrantDepartments(actor,true);
    const [member,board]=await Promise.all([
      db().collection('bpd_discord_auth').doc(actor.discordId).get(),
      db().collection('bpd_board_appointments').doc(actor.discordId).get()
    ]);
    const verified=verifyBoardDiscordRole(member.data(),process.env.DISCORD_GUILD_ID)||
      activeBoardAppointment(board.data());
    return leaveGrantDepartments(actor,verified);
  }
  // Verifieer bestuurslidmaatschap bij iedere gevoelige aanvraag tegen actuele bron.
  async function verifiedBoardFor(actor){
    if(!validDiscordId(actor?.discordId))return false;
    if(actor.role==='beheerder')return true; // Technisch beheer.
    const [member,appointment]=await Promise.all([
      db().collection('bpd_discord_auth').doc(actor.discordId).get(),
      db().collection('bpd_board_appointments').doc(actor.discordId).get()
    ]);
    return verifyBoardDiscordRole(member.exists?member.data():null,process.env.DISCORD_GUILD_ID)||
      activeBoardAppointment(appointment.exists?appointment.data():null);
  }
  async function grantFor(actor){
    // Discord ID is the canonical grant key. Old Google-UID documents continue
    // to work until replaced; a revoked Discord grant overrides an old one.
    const id=actor?.discordId;
    if(!validDiscordId(id))return null;
    const current=await db().collection(grants).doc(id).get();
    if(current.exists)return current.data();
    if(typeof actor.uid==='string'&&actor.uid!==id){
      const legacy=await db().collection(grants).doc(actor.uid).get();
      return legacy.exists?legacy.data():null;
    }
    return null;
  }
  app.get('/api/leave/me',requireUser,async(req,res)=>{
    try {
      const {departments}=await context(req),grant=activeGrant(await grantFor(req.bpd));
      return res.json({role:req.bpd.role,departments,departmentRoles:req.bpd.departmentRoles,discordId:req.bpd.discordId,
        grant:grant?{level:grant.level,startsOn:grant.startsOn,expiresOn:grant.expiresOn}:null,
        canManageGrants:false,canReview:mayReviewLeaveNotifications(req.bpd,Boolean(grant)),writesEnabled:writes()});
    }catch(e){return jsonError(res,e)}
  });
  // Historische aanvragen bevatten soms nog geen kaderrol. Los die uitsluitend
  // via een goedgekeurd portaalaccount op, nooit via browserinvoer.
  async function resolveApplicantRoles(request){
    if(request.subjectDepartmentRoles&&
      Object.values(request.subjectDepartmentRoles).some(Boolean))return request;
    if(!validDiscordId(request.personDiscordId))return request;
    try{
      const approved=await targetAccount(request.personDiscordId);
      const roles=Object.fromEntries((request.subjectDepartments||[]).map(dept=>
        [dept,roleForDepartment(approved,dept)]));
      return {...request,subjectDepartmentRoles:roles};
    }catch{return request}
  }
  // Dedicated notifications capability: personnel requests remain elsewhere.
  app.get('/api/leave/notifications/context',requireUser,async(req,res)=>{
    try{
      const board=await verifiedBoardFor(req.bpd);
      if(!board)await context(req);
      const delegated=Boolean(activeGrant(await grantFor(req.bpd)));
      return res.json({canReview:board||mayReviewLeaveNotifications(req.bpd,delegated),
        canOverride:board,writesEnabled:writes()});
    }catch(e){return jsonError(res,e)}
  });
  app.get('/api/leave/requests',requireUser,async(req,res)=>{
    try {
      const board=await verifiedBoardFor(req.bpd);
      const {departments}=board?{departments:req.bpd.departments}:await context(req);
      const leave=db().collection(coll);
      const grant=activeGrant(await grantFor(req.bpd));
      const my=await leave.where('personDiscordId','==',req.bpd.discordId).limit(100).get();
      let review=[],overrides=[];
      if(board||grant){
        const all=await leave.limit(250).get();
        review=all.docs.filter(d=>d.get('status')==='pending'&&d.get('personDiscordId')!==req.bpd.discordId);
        if(board)overrides=all.docs.filter(d=>
          ['approved','rejected'].includes(d.get('status'))&&d.get('personDiscordId')!==req.bpd.discordId);
      }else if(req.bpd.departments.length===1||Object.keys(req.bpd.departmentRoles||{}).length){
        const permitted=departments.filter(d=>req.bpd.departments.includes(d));
        const lists=await Promise.all(permitted.map(dept=>
          leave.where('subjectDepartments','array-contains',dept).limit(100).get()));
        review=[...new Map(lists.flatMap(x=>x.docs)
          .filter(d=>d.get('status')==='pending').map(d=>[d.id,d])).values()];
      }
      const allowed=await Promise.all(review.map(async d=>board||mayApproveLeave(
        req.bpd,await resolveApplicantRoles(d.data()),grant,yyyyMmDd(),false)));
      review=review.filter((d,i)=>allowed[i]);
      const byTime=(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''));
      return res.json({mine:my.docs.map(d=>item(d,true)).sort(byTime),
        toReview:review.map(d=>item(d,false)).sort(byTime),
        toOverride:board?overrides.map(d=>item(d,false)).sort(byTime):[],
        canOverride:board,limited:my.docs.length===100||review.length>=100||overrides.length>=250});
    }catch(e){return jsonError(res,e)}
  });
  // Dossierweergave per hulpdienst: enkel kalenderdata/status, GEEN reden of
  // vertrouwelijke beslissing. Een medewerker mag zijn eigen verlof zien.
  // Only current, APPROVED leave is shown in the roster. Date boundaries
  // use Europe/Brussels calendar days, not server time or historical status.
  app.get('/api/leave/roster-active',requireDossierUser,async(req,res)=>{
    try{
      const roster=await getSnapshot();
      if(roster.stale===true)
        return res.status(503).json({error:'De personeelsbron is niet actueel'});
      const snapshot=roster.data;
      const allowed=req.bpd.dossierAllowedDepartments||req.bpd.departments||[];
      const visibleIds=new Set(snapshot.filter(p=>allowed.includes(p.dept))
        .map(p=>p.personId).filter(validDiscordId));
      if(!visibleIds.size)return res.json({activeDiscordIds:[],date:yyyyMmDd()});
      const today=yyyyMmDd();
      const snap=await db().collection(coll).where('status','==','approved')
        .limit(1500).get();
      const active=new Set();
      for(const doc of snap.docs){
        const row=doc.data();
        if(visibleIds.has(row.personDiscordId)&&row.startDate<=today&&
          row.endDate>=today)active.add(row.personDiscordId);
      }
      res.set('Cache-Control','no-store');
      return res.json({activeDiscordIds:[...active],date:today,
        limited:snap.size===1500});
    }catch(e){return jsonError(res,e)}
  });
  app.get('/api/leave/person/:discordId',requireDossierUser,async(req,res)=>{
    const personId=String(req.params.discordId||''),dept=String(req.query.dept||'');
    if(!validDiscordId(personId))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const {snapshot}=await context(req);
      const records=personRecords(snapshot,personId);
      if(!records.some(p=>p.dept===dept))return res.status(404).json({error:'Geen lidmaatschap gevonden'});
      const self=personId===req.bpd.discordId;
      const canRead=Array.isArray(req.bpd.dossierAllowedDepartments)
        ?req.bpd.dossierAllowedDepartments.includes(dept)
        :(['middenkader','officierenkader','korpsleiding'].includes(roleForDepartment(req.bpd,dept))&&
          req.bpd.departments?.includes(dept));
      if(!self&&!canRead)
        return res.status(403).json({error:'Geen toegang tot deze hulpdienst'});
      const snap=await db().collection(coll).where('personDiscordId','==',personId).limit(100).get();
      const grant=activeGrant(await grantFor(req.bpd));
      const selected=snap.docs.filter(d=>{
        const record=d.data();
        // Verlof is persoonsgebonden: alle huidige dienstendossiers van
        // dezelfde Discord-identiteit tonen dezelfde verlofhistoriek.
        // De voorafgaande check verifieert eerst de huidige diensttoegang.
        return self||['approved','rejected','withdrawn','pending'].includes(record.status);
      });
      res.json({personDiscordId:personId,dept,
        leaves:selected.map(d=>{
          const record=d.data();
          const canDecide=mayApproveLeave(req.bpd,record,grant);
          return {id:d.id,startDate:record.startDate,endDate:record.endDate,
            days:record.days,status:record.status,manual:record.manual===true,
            canDecide:canDecide&&writes()};
        }),limited:snap.docs.length===100});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/requests',requireUser,requireWrites,async(req,res)=>{
    try {
      const {records}=await context(req);
      let details;
      try{details=validateLeaveRequest(req.body)}
      catch(e){throw rejection(e.message,400)}
      const id=req.bpd.discordId;
      const subjectName=records.find(p=>req.bpd.departments.includes(p.dept))?.name||'Onbekend personeelslid';
      const subjectCall=records.find(p=>req.bpd.departments.includes(p.dept))?.call||'';
      const ref=db().collection(coll).doc(`${id}_${details.startDate}_${details.endDate}`);
      const subjectDepartments=departmentsOf(records);
      if(!subjectDepartments.length)throw rejection('Geen actieve hulpdiensten gevonden',403);
      const isCorps=leaveApplicantIsCorps(req.bpd,subjectDepartments);
      const status=leaveSubmissionStatus(details.days,isCorps);
      const subjectDepartmentRoles=Object.fromEntries(subjectDepartments.map(dept=>[
        dept,req.bpd.portalTechnicalMode===true
          ?req.bpd.operationalDepartmentRoles?.[dept]||null
          :roleForDepartment(req.bpd,dept)
      ]));
      const autoApproved=status==='approved';
      // The original deterministic document is the historical anchor for
      // this exact interval. Withdrawn/rejected requests remain immutable
      // history; subsequent attempts receive a new Firestore document ID.
      // The anchor only records a pointer to the newest attempt, so
      // concurrent submissions conflict on one transactionally read document.
      let createdId=null;
      try{
        await db().runTransaction(async tx=>{
          const original=await tx.get(ref);
          let latest=original;
          if(original.exists&&original.get('latestAttemptId')){
            const latestId=original.get('latestAttemptId');
            if(!validId(latestId)||latestId===ref.id)
              throw rejection('Controle van eerdere aanvragen mislukt. Contacteer een beheerder.',409);
            latest=await tx.get(db().collection(coll).doc(latestId));
            if(!latest.exists)
              throw rejection('Eerdere verlofaanvraag kon niet worden gecontroleerd. Contacteer een beheerder.',409);
          }
          if(latest.exists&&['pending','approved'].includes(latest.get('status')))
            throw rejection('Voor deze periode bestaat al een lopende of goedgekeurde verlofaanvraag',409);
          // Fail closed for any unexpected state; only completed/rejected
          // submissions are eligible for a fresh immutable attempt.
          if(latest.exists&&!leaveCanReapply(latest.get('status')))
            throw rejection('Status van eerdere verlofaanvraag onbekend. Contacteer een beheerder.',409);
          const target=original.exists?db().collection(coll).doc():ref;
          if(original.exists)tx.update(ref,{
            latestAttemptId:target.id,latestAttemptAt:FieldValue.serverTimestamp()
          });
          tx.create(target,{...details,note:isCorps?'':details.note,
            personDiscordId:id,subjectName,subjectCall,subjectDepartments,subjectDepartmentRoles,
            subjectRole:req.bpd.portalTechnicalMode===true?req.bpd.operationalRole:req.bpd.role,
            status,autoApproved,approvalReason:isCorps?'korpsleiding_vrijgesteld':
              autoApproved?'duur_7_tot_14_dagen':null,
            submittedByUid:req.bpd.uid,submittedByDiscordId:id,
            ...(original.exists?{previousAttemptId:latest.id}:{}),
            ...(autoApproved?{decidedAt:FieldValue.serverTimestamp(),decidedBy:'system'}:{}),
            createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
          const historyBase={...details,personDiscordId:id,subjectName,
            subjectCall,subjectDepartments,status};
          const submitter=actorFromPersonnel(req.bpd,records)||{
            name:subjectName,call:subjectCall,discordId:id
          };
          writeLeaveEvent(tx,{requestRef:target,request:historyBase,action:'submitted',
            actor:submitter,actorUid:req.bpd.uid,eventDate:yyyyMmDd(),to:'pending'});
          if(autoApproved)writeLeaveEvent(tx,{requestRef:target,request:historyBase,
            action:isCorps?'korpsleiding_vrijgesteld':'automatic_approved',
            actor:null,actorUid:null,eventDate:yyyyMmDd(),from:'pending',to:'approved'});
          createdId=target.id;
        });
      }catch(e){
        if(e.code===6||e.code==='already-exists')
          throw rejection('Er bestaat intussen al een aanvraag voor deze periode. Vernieuw je verlofoverzicht.',409);
        throw e;
      }
      return res.status(201).json({id:createdId,status,days:details.days,automatic:autoApproved});
    }catch(e){return jsonError(res,e)}
  });
  // Een eigen nog lopend/voorafgaand verlof intrekken, nooit verwijderen.
  // De originele aanvraag, alle beslissingen en het tijdstip blijven bewaard.
  // Withdraw an approved leave period only on an independently confirmed
  // higher-cadre correction. This immediately clears every service's leave
  // indicator; the same transaction logs audit and all weekreports.
  app.post('/api/leave/requests/:id/retire',requireDossierUser,requireWrites,async(req,res)=>{
    const requestId=String(req.params.id||''),dept=String(req.body?.dept||'');
    if(!validId(requestId)||!['politie','brandweer','ambulance','depannage'].includes(dept))
      return res.status(400).json({error:'Ongeldige verlofverwijzing'});
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(!req.body||Object.keys(req.body).some(k=>!['dept','reason'].includes(k))||
      reason.length<10||reason.length>500)
      return res.status(400).json({error:'Motivering van 10 tot 500 tekens vereist'});
    try{
      const {snapshot}=await context(req);
      const ref=db().collection(coll).doc(requestId);
      const before=await ref.get();
      if(!before.exists)throw rejection('Verlofperiode niet gevonden',404);
      const leave=before.data();
      const subject=personRecords(snapshot,leave.personDiscordId).find(p=>p.dept===dept);
      if(!subject||!canRetireDossierRecord(req.bpd,subject))
        throw rejection('Alleen het bevoegde Officierenkader of Korpsleiding kan deze verlofperiode intrekken',403);
      const actor=actorFromPersonnel(req.bpd,snapshot);
      if(!actor)throw rejection('Personeelsidentiteit niet geverifieerd',403);
      await db().runTransaction(async tx=>{
        const previous=await tx.get(ref);
        if(!previous.exists)throw rejection('Verlofperiode bestaat niet',404);
        const item=previous.data();
        if(item.personDiscordId!==subject.personId||item.status!=='approved')
          throw rejection('Alleen een nog goedgekeurde verlofperiode kan worden ingetrokken',409);
        tx.update(ref,{status:'withdrawn',
          withdrawnAt:FieldValue.serverTimestamp(),withdrawReason:reason,
          withdrawnByDiscordId:req.bpd.discordId,withdrawnByUid:req.bpd.uid,
          updatedAt:FieldValue.serverTimestamp()});
        writeLeaveEvent(tx,{requestRef:ref,request:item,action:'cadre_retired',
          actor,actorUid:req.bpd.uid,eventDate:yyyyMmDd(),
          from:'approved',to:'withdrawn',note:reason});
      });
      return res.json({saved:true,retired:true,status:'withdrawn',reportLogged:true});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/requests/:id/withdraw',requireUser,requireWrites,async(req,res)=>{
    const requestId=String(req.params.id||'');
    if(!validId(requestId))return res.status(400).json({error:'Ongeldig aanvraagnummer'});
    const reason=req.body?.reason===undefined?'':req.body.reason;
    if(typeof reason!=='string'||reason.trim().length>300)
      return res.status(400).json({error:'Intrekkingsreden mag maximaal 300 tekens bevatten'});
    try{
      const {records}=await context(req);
      const ref=db().collection(coll).doc(requestId),today=yyyyMmDd();
      await db().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)throw rejection('Verlofaanvraag niet gevonden',404);
        const prior=snap.data();
        if(prior.personDiscordId!==req.bpd.discordId)
          throw rejection('Je kunt uitsluitend je eigen verlof intrekken',403);
        if(!leaveCanWithdraw(prior,today))
          throw rejection('Alleen een lopende of goedgekeurde aanvraag die nog niet is afgelopen kan worden ingetrokken',409);
        const submitter=actorFromPersonnel(req.bpd,records)||
          {discordId:req.bpd.discordId,name:prior.subjectName||'Aanvrager',call:prior.subjectCall||''};
        tx.update(ref,{status:'withdrawn',withdrawnAt:FieldValue.serverTimestamp(),
          withdrawnByDiscordId:req.bpd.discordId,withdrawnByUid:req.bpd.uid,
          withdrawReason:reason.trim(),updatedAt:FieldValue.serverTimestamp()});
        writeLeaveEvent(tx,{requestRef:ref,request:prior,action:'withdrawn',
          actor:submitter,actorUid:req.bpd.uid,eventDate:today,
          from:prior.status,to:'withdrawn',note:reason.trim()});
      });
      return res.json({ok:true,status:'withdrawn',historyPreserved:true});
    }catch(e){return jsonError(res,e)}
  });
  // Detailhistoriek voor de aanvrager: bestaande auditstukken blijven
  // zichtbaar ook na een intrekking of afwijzing.
  app.get('/api/leave/requests/:id/history',requireUser,async(req,res)=>{
    const requestId=String(req.params.id||'');
    if(!validId(requestId))return res.status(400).json({error:'Ongeldig aanvraagnummer'});
    try{
      const ref=db().collection(coll).doc(requestId);
      const request=await ref.get();
      if(!request.exists)return res.status(404).json({error:'Verlofaanvraag niet gevonden'});
      const data=request.data();
      if(data.personDiscordId!==req.bpd.discordId)
        return res.status(403).json({error:'Deze historiek behoort niet tot je eigen verlof'});
      const snap=await ref.collection('audit').orderBy('at','asc').limit(75).get();
      res.set('Cache-Control','private, no-store');
      return res.json({id:requestId,status:data.status,events:snap.docs.map(doc=>{
        const event=doc.data(),actorId=event.actorDiscordId;
        return {action:event.action||'gewijzigd',from:event.from||null,to:event.to||null,
          at:iso(event.at),actorType:!actorId?'system':
            actorId===req.bpd.discordId?'self':'reviewer'};
      }),limited:snap.docs.length===75});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/requests/:id/decision',requireUser,requireWrites,async(req,res)=>{
    if(!validId(req.params.id))return res.status(400).json({error:'Ongeldig aanvraagnummer'});
    const decision=req.body?.decision;
    if(!['approved','rejected'].includes(decision))return res.status(400).json({error:'Ongeldige beslissing'});
    const note=req.body?.note===undefined?'':req.body.note;
    if(typeof note!=='string'||note.trim().length>300)return res.status(400).json({error:'Beslissingsnotitie te lang'});
    try{
      const board=await verifiedBoardFor(req.bpd);
      if(!board)await context(req);
      const ref=db().collection(coll).doc(req.params.id);
      const canonical=db().collection(grants).doc(req.bpd.discordId);
      const legacy=req.bpd.uid===req.bpd.discordId?null:db().collection(grants).doc(req.bpd.uid);
      await db().runTransaction(async tx=>{
        const [request,grantDoc,oldGrant]=await Promise.all([
          tx.get(ref),tx.get(canonical),legacy?tx.get(legacy):Promise.resolve(null)
        ]);
        if(!request.exists)throw rejection('Verlofaanvraag niet gevonden',404);
        const d=request.data();
        if(d.status!=='pending')throw rejection('Aanvraag is al behandeld',409);
        const grant=grantDoc.exists?grantDoc.data():oldGrant?.exists?oldGrant.data():null;
        if(!mayApproveLeave(req.bpd,board?d:await resolveApplicantRoles(d),grant,yyyyMmDd(),board))
          throw rejection('Geen bevoegdheid om dit verlof goed te keuren',403);
        tx.update(ref,{status:decision,decidedByUid:req.bpd.uid,decidedByDiscordId:req.bpd.discordId,
          decidedAt:FieldValue.serverTimestamp(),decisionNote:note.trim(),updatedAt:FieldValue.serverTimestamp()});
        writeLeaveEvent(tx,{requestRef:ref,request:d,action:decision,
          actor:{discordId:req.bpd.discordId,name:'Bevoegd kaderlid',call:''},
          actorUid:req.bpd.uid,eventDate:yyyyMmDd(),from:'pending',to:decision,note:note.trim()});
      });
      return res.json({ok:true,status:decision});
    }catch(e){return jsonError(res,e)}
  });
  // Bestuur/technisch beheer kan eerder genomen beslissingen expliciet herzien.
  // Niet beschikbaar voor gewone kaderleden, en nooit voor eigen aanvragen.
  app.post('/api/leave/requests/:id/override',requireUser,requireWrites,async(req,res)=>{
    if(!validId(req.params.id))return res.status(400).json({error:'Ongeldig aanvraagnummer'});
    if(!['approved','rejected'].includes(req.body?.decision))
      return res.status(400).json({error:'Ongeldige beslissing'});
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(reason.length<10||reason.length>300)
      return res.status(400).json({error:'Een gemotiveerde bestuursbeslissing van 10 tot 300 tekens is verplicht'});
    try{
      if(!await verifiedBoardFor(req.bpd))throw rejection('Alleen geverifieerd Bestuur mag eerdere beslissingen overrulen',403);
      const ref=db().collection(coll).doc(req.params.id);
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists)throw rejection('Verlofaanvraag niet gevonden',404);
        const previous=doc.data();
        if(previous.personDiscordId===req.bpd.discordId)throw rejection('Een eigen aanvraag mag niet worden overruled',403);
        if(!['approved','rejected'].includes(previous.status))
          throw rejection('Deze aanvraag wacht nog op een gewone beslissing',409);
        if(previous.status===req.body.decision)throw rejection('Deze beslissing is al van kracht',409);
        tx.update(ref,{status:req.body.decision,
          decidedByUid:req.bpd.uid,decidedByDiscordId:req.bpd.discordId,
          decidedAt:FieldValue.serverTimestamp(),decisionNote:reason,
          overriddenFrom:previous.status,overriddenAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp()});
        writeLeaveEvent(tx,{requestRef:ref,request:previous,action:'board_override',
          actor:{discordId:req.bpd.discordId,name:'Bestuur',call:''},
          actorUid:req.bpd.uid,eventDate:yyyyMmDd(),
          from:previous.status,to:req.body.decision,note:reason});
      });
      return res.json({ok:true,status:req.body.decision,overridden:true});
    }catch(e){return jsonError(res,e)}
  });
  // One manually approved PERSON-level leave record for every current service
  // of the same Discord identity. Only verified Police cadre may create it.
  // The write and all four service weekreport notices share one transaction.
  app.post('/api/leave/manual',requireUser,requireWrites,async(req,res)=>{
    if(process.env.BPD_ENABLE_PERSONNEL_MANUAL_LEAVE!=='true')
      return res.status(503).json({error:'Handmatige verlofregistratie staat nog niet open'});
    const dept=String(req.body?.dept||''),personId=String(req.body?.discordId||'');
    if(!validDiscordId(personId)||!['politie','ambulance','brandweer','depannage'].includes(dept))
      return res.status(400).json({error:'Ongeldige dienst of personeelsreferentie'});
    let details;
    try{details=validateManualLeaveRequest(req.body)}
    catch(e){return res.status(400).json({error:e.message})}
    try{
      const {snapshot}=await context(req);
      const matched=personRecords(snapshot,personId);
      if(!matched.some(p=>p.dept===dept))
        throw rejection('Personeelslid ontbreekt in de geselecteerde hulpdienst',404);
      const departments=departmentsOf(matched);
      const policeProfile=matched.find(p=>p.dept==='politie');
      // The target's approved role can strengthen roster classification.
      // The roster is always checked server-side, never accepted from the UI.
      let subjectPoliceRole=policeProfile?rosterPoliceRole(policeProfile):null;
      if(policeProfile){
        try{
          const verified=await targetAccount(personId);
          subjectPoliceRole=roleForDepartment(verified,'politie')||subjectPoliceRole;
        }catch{/* no permission is inferred from an unapproved account */}
      }
      if(!mayRegisterCentralManualLeave(req.bpd,personId,details.days,
          subjectPoliceRole,Boolean(policeProfile)))
        throw rejection('Enkel bevoegd politioneel kader kan dit verlof registreren; controleer duur en rang',403);
      const uniqueId='manual_central_'+personId+'_'+details.startDate+'_'+details.endDate;
      const ref=db().collection(coll).doc(uniqueId);
      const subject=matched.find(p=>p.dept===dept)||matched[0];
      await db().runTransaction(async tx=>{
        // Reading the person's application range transactionally also protects
        // against overlapping approved leave entered concurrently.
        const existing=await tx.get(db().collection(coll)
          .where('personDiscordId','==',personId).limit(200));
        if(existing.size===200)
          throw rejection('Verlofhistoriek is te groot voor een veilige controle',503);
        const collision=existing.docs.some(doc=>{
          const old=doc.data();
          return old.status==='approved'&&old.startDate<=details.endDate&&
            old.endDate>=details.startDate;
        });
        if(collision)throw rejection('Deze periode overlapt een reeds goedgekeurd verlof',409);
        const previous=await tx.get(ref);
        if(previous.exists)throw rejection('Deze verlofregistratie bestaat al',409);
        tx.create(ref,{...details,manual:true,personDiscordId:personId,
          subjectName:subject.name,subjectDepartments:departments,
          status:'approved',submittedByUid:req.bpd.uid,
          submittedByDiscordId:req.bpd.discordId,
          decidedByUid:req.bpd.uid,decidedByDiscordId:req.bpd.discordId,
          createdAt:FieldValue.serverTimestamp(),
          decidedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp()});
        writeLeaveEvent(tx,{requestRef:ref,request:{
          ...details,personDiscordId:personId,subjectName:subject.name,
          subjectCall:subject.call,subjectDepartments:departments,status:'approved'
        },action:'manual_approved',actor:{
          discordId:req.bpd.discordId,name:'Politioneel kader',call:''
        },actorUid:req.bpd.uid,eventDate:yyyyMmDd(),to:'approved',note:details.note});
      });
      return res.status(201).json({id:uniqueId,status:'approved',
        days:details.days,manual:true,departments});
    }catch(e){return jsonError(res,e)}
  });
  // Granting the portal's temporary VERLOFBEHEER function does NOT mutate
  // any Discord guild role. That requires a separately authorized bot.
  const targetAccount=async id=>{
    if(!validDiscordId(id))throw rejection('Ongeldig Discord-ID');
    const managed=await db().collection(USER_COLLECTION).doc(id).get();
    if(managed.exists){
      const entry=approvedManagedEntry(managed.data(),id);
      if(!entry)throw rejection('Dit Discord-account is niet goedgekeurd voor het portaal',403);
      return entry;
    }
    const matched=Object.values(accessList()).filter(e=>e?.discordId===id);
    if(matched.length!==1||!Array.isArray(matched[0].departments)||
      matched[0].departments.length===0||
      !['basiskader','middenkader','officierenkader','korpsleiding','beheerder'].includes(matched[0].role))
      throw rejection('Keur dit Discord-account eerst goed voor het portaal',403);
    return matched[0];
  };
  const legacyEmailFor=id=>{
    const list=Object.entries(accessList()).filter(([email,entry])=>
      entry?.discordId===id&&typeof email==='string'&&email.includes('@'));
    return list.length===1?list[0][0]:null;
  };
  app.get('/api/leave/grants/context',requireUser,async(req,res)=>{
    try{
      const departments=await grantManagerScope(req.bpd);
      return res.json({canManage:departments.length>0,departments,writesEnabled:writes()});
    }catch(e){return jsonError(res,e)}
  });
  app.get('/api/leave/grants',requireUser,async(req,res)=>{
    try{
      const allowed=await grantManagerScope(req.bpd);
      if(!allowed.length)return res.status(403).json({error:'Geen machtigingsrechten'});
      const data=await db().collection(grants).limit(101).get();
      if(data.size>100)return res.status(503).json({error:'Te veel machtigingen. Beheer heeft paginering nodig.'});
      const visible=data.docs.filter(d=>
        Array.isArray(d.get('grantDepartments'))&&
        d.get('grantDepartments').some(dept=>allowed.includes(dept)));
      const result=new Map();
      // Old email-based records are still displayed against their mapped Discord ID.
      for(const d of visible){
        const x=d.data(),id=validDiscordId(x.discordId)?x.discordId:
          Object.entries(accessList()).find(([email,entry])=>email===x.email&&validDiscordId(entry?.discordId))?.[1]?.discordId;
        if(!validDiscordId(id))continue;
        const row={discordId:id,level:x.level,startsOn:x.startsOn,
          expiresOn:x.expiresOn,revoked:Boolean(x.revoked),legacy:!validDiscordId(x.discordId)};
        if(!result.has(id)||!row.legacy)result.set(id,row);
      }
      return res.json({grants:[...result.values()]});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/grants',requireUser,requireWrites,async(req,res)=>{
    try{
      const allowed=await grantManagerScope(req.bpd);
      if(!allowed.length)throw rejection('Alleen bevoegde leidinggevenden, Bestuur of technisch beheer kunnen verlofmachtigingen toekennen',403);
      const grant=validateGrant(req.body);
      if(grant.discordId===req.bpd.discordId)throw rejection('Je kunt jezelf geen aanvullende machtiging geven',403);
      const target=await targetAccount(grant.discordId);
      const grantDepartments=target.departments.filter(d=>allowed.includes(d));
      if(!grantDepartments.length)throw rejection('De medewerker behoort niet tot jouw gemachtigde hulpdienst',403);
      const ref=db().collection(grants).doc(grant.discordId),audit=ref.collection('audit').doc();
      await db().runTransaction(async tx=>{
        const previous=await tx.get(ref);
        // A service officer cannot overwrite a grant involving another service.
        if(previous.exists&&Array.isArray(previous.get('grantDepartments'))&&
          !previous.get('grantDepartments').every(dept=>allowed.includes(dept)))
          throw rejection('Deze machtiging bevat andere hulpdiensten. Laat Bestuur of technisch beheer de wijziging uitvoeren.',403);
        tx.set(ref,{...grant,grantDepartments,revoked:false,grantedByUid:req.bpd.uid,
          grantedByDiscordId:req.bpd.discordId,grantedAt:FieldValue.serverTimestamp()});
        tx.create(audit,{action:'grant',...grant,byUid:req.bpd.uid,
          byDiscordId:req.bpd.discordId,at:FieldValue.serverTimestamp()});
      });
      return res.status(201).json({ok:true,discordId:grant.discordId,level:grant.level,
        expiresOn:grant.expiresOn,discordGuildRoleUpdated:false});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/grants/revoke',requireUser,requireWrites,async(req,res)=>{
    try{
      const allowed=await grantManagerScope(req.bpd);
      if(!allowed.length)throw rejection('Geen machtigingsrechten',403);
      const id=typeof req.body?.discordId==='string'?req.body.discordId.trim():'';
      if(!validDiscordId(id))throw rejection('Vul een geldig Discord-ID in');
      if(id===req.bpd.discordId)throw rejection('Je kunt je eigen machtiging hier niet aanpassen',403);
      const direct=db().collection(grants).doc(id);
      // For a Google-UID legacy grant, find its old document if there is no
      // Discord-ID grant. Revocations are always audited and kept in Firestore.
      const directSnap=await direct.get();
      let ref=direct;
      if(!directSnap.exists){
        const email=legacyEmailFor(id);
        if(!email)throw rejection('Machtiging niet gevonden',404);
        let uid;
        try{uid=(await getAuth().getUserByEmail(email)).uid}
        catch(e){if(e.code==='auth/user-not-found')throw rejection('Machtiging niet gevonden',404);throw e}
        ref=db().collection(grants).doc(uid);
      }
      await db().runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists)throw rejection('Machtiging niet gevonden',404);
        const previous=current.data();
        if(previous.discordId!==id &&
          !(previous.email&&legacyEmailFor(id)===previous.email))
          throw rejection('Discord-koppeling van deze machtiging klopt niet',403);
        if(!Array.isArray(previous.grantDepartments)||
          !previous.grantDepartments.every(d=>allowed.includes(d)))
          throw rejection('Geen bevoegdheid voor deze machtiging',403);
        const audit=ref.collection('audit').doc();
        tx.update(ref,{revoked:true,revokedAt:FieldValue.serverTimestamp(),
          revokedByUid:req.bpd.uid,revokedByDiscordId:req.bpd.discordId});
        tx.create(audit,{action:'revoke',subjectDiscordId:id,byUid:req.bpd.uid,
          byDiscordId:req.bpd.discordId,at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true});
    }catch(e){return jsonError(res,e)}
  });
}
