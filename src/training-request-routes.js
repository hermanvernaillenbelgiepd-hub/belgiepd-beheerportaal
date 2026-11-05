import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {approvedManagedEntry,USER_COLLECTION,verifiedDiscordIdentity} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';
import {TRAINING_ROLE_IDS} from './role-catalog.js';
import {
  TRAINING_REQUEST_DEPARTMENTS,SERIES_LEADERS,policeRequestTier,personSeries,
  requestCourseOptions,canSubmitTrainingRequest,mayReviewTrainingRequest,
  validateTrainingRequestInput,nextTrainingRequestStatus,validTrainingSchedule,
  ACTIVE_TRAINING_REQUEST_STATUSES
} from './training-request-policy.js';

const validId=id=>/^\d{15,22}$/.test(String(id||''));
const iso=v=>v?.toDate?.()?.toISOString()||null;
const localDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const error=(res,e)=>{
  if(e?.status)return res.status(e.status).json({error:e.message});
  console.error('Opleidingsaanvragen:',e?.code||'opslag of verificatie niet beschikbaar');
  return res.status(503).json({error:'Opleidingsaanvragen zijn momenteel niet beschikbaar'});
};
const rejection=(message,status=403)=>Object.assign(Error(message),{status});

export function installTrainingRequestRoutes(app,{getSnapshot,accessList}){
  const db=()=>getFirestore();
  async function identity(req,res,next){
    res.set('Cache-Control','private, no-store');
    const token=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
    if(!token)return res.status(401).json({error:'Meld je aan met Google of Discord'});
    try{
      if(!getApps().length)initializeApp({credential:applicationDefault(),
        projectId:process.env.FIREBASE_PROJECT_ID});
      const decoded=await getAuth().verifyIdToken(token);
      let id='',grant=null;
      if(decoded.firebase?.sign_in_provider==='custom'&&decoded.bpdDiscord===true&&
        decoded.bpdGuildId===process.env.DISCORD_GUILD_ID&&
        typeof decoded.uid==='string'&&decoded.uid.startsWith('discord:')){
        if(process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN!=='true')
          throw rejection('Discord-aanmelding staat momenteel uit');
        id=decoded.uid.slice(8);
        if(!validId(id))throw rejection('Ongeldige Discord-identiteit');
        const [member,managed]=await Promise.all([
          db().collection('bpd_discord_auth').doc(id).get(),
          db().collection(USER_COLLECTION).doc(id).get()
        ]);
        if(!verifiedDiscordIdentity(decoded,member.data(),process.env.DISCORD_GUILD_ID))
          throw rejection('Vernieuw eerst je Discord-verificatie');
        if(managed.get('status')==='blocked')
          throw rejection('Je account is geblokkeerd');
        grant=approvedManagedEntry(managed.data(),id);
        // Alleen een bestaande expliciet goedgekeurde Google-allowlist mag
        // voor historische accounts als bevoegdheidsbron gelden.
        if(!grant&&!managed.exists){
          const entries=Object.values(accessList()||{}).filter(e=>e?.discordId===id&&
            Array.isArray(e.departments));
          if(entries.length===1)grant=entries[0];
        }
      }else if(decoded.firebase?.sign_in_provider==='google.com'&&decoded.email_verified){
        const mapped=accessList()?.[String(decoded.email||'').toLowerCase()];
        id=String(mapped?.discordId||'');
        if(!validId(id))throw rejection('Koppel eerst je Discord-ID aan je Google-account');
        const managed=await db().collection(USER_COLLECTION).doc(id).get();
        if(managed.exists){
          grant=approvedManagedEntry(managed.data(),id);
          if(!grant)throw rejection('Je portaalaccount is niet goedgekeurd');
        }else grant=mapped;
      }else throw rejection('Geen geldige BelgiumPD-aanmelding');
      if(!validId(id))throw rejection('Discord-ID ontbreekt');
      const snapshot=await getSnapshot();
      if(snapshot.stale)throw rejection('Personeelsbron is niet actueel',503);
      const persons=(snapshot.data||[]).filter(p=>p.personId===id&&
        TRAINING_REQUEST_DEPARTMENTS.includes(p.dept));
      const memberships=Array.isArray(grant?.departments)?grant.departments:[];
      // Een persoonsfiche alleen geeft geen leidinggevendenrechten.
      const actor={
        discordId:id,role:grant?.role||null,
        departments:memberships.filter(d=>persons.some(p=>p.dept===d)),
        departmentRoles:grant?.departmentRoles||{}
      };
      // A fresh guild-role snapshot permits instructor-only scheduling, but
      // never confers access to another department's course management.
      const guild=await db().collection('bpd_discord_auth').doc(id).get();
      const verified=guild.exists&&guild.get('guildId')===process.env.DISCORD_GUILD_ID&&
       Array.isArray(guild.get('roleIds'))&&Number.isSafeInteger(guild.get('verifiedAt'))&&
       Date.now()-guild.get('verifiedAt')<24*60*60*1000&&
       guild.get('verifiedAt')<=Date.now()+60_000;
      req.trainingApplicant={id,uid:decoded.uid,persons,actor,snapshot:snapshot.data,
        verifiedRoleIds:verified?guild.get('roleIds'):[]};
      next();
    }catch(e){error(res,e)}
  }
  const applicant=(ctx,dept)=>ctx.persons.filter(p=>p.dept===dept).length===1?
    ctx.persons.find(p=>p.dept===dept):null;
  const tierOf=(ctx,person)=>person.dept==='politie'?policeRequestTier(person):null;
  const ownRecord=(ctx,person)=>person?.personId===ctx.id&&
    ctx.persons.filter(p=>p.dept===person.dept).length===1;
  const maySubmit=(ctx,person)=>canSubmitTrainingRequest(
    person,tierOf(ctx,person),roleForDepartment(ctx.actor,person.dept),
    ownRecord(ctx,person)
  );
  const reviewScope=(ctx,request)=>mayReviewTrainingRequest(ctx.actor,request) ||
    // Reekshoofden mogen uitsluitend aanvragen uit hun eigen reeks bekijken.
    // Hun IDs zijn centraal vastgelegd, niet vanuit de browser opgegeven.
    (request.department==='politie'&&ctx.persons.some(p=>p.dept==='politie')&&
      mayReviewTrainingRequest({
        ...ctx.actor,departments:['politie'],
        departmentRoles:{politie:'basiskader'}
      },request))||
    // Independently verified service instructors may treat training requests
    // for their own service; police officer/corps applications stay protected.
    (ctx.persons.some(p=>p.dept===request.department)&&
      (TRAINING_ROLE_IDS[request.department]?.instructors||[])
        .some(id=>ctx.verifiedRoleIds.includes(id))&&
      (request.department!=='politie'||
        !['officierenkader','korpsleiding'].includes(request.applicantTier))&&
      request.applicantDiscordId!==ctx.id);
  // Scheduling is distinct from being a reekshoofd or reading a request.
  // A genuine instructor role or verified service leadership is required.
  const scheduleScope=(ctx,dept)=>ctx.persons.some(p=>p.dept===dept)&&
    (['middenkader','officierenkader','korpsleiding'].includes(
      roleForDepartment(ctx.actor,dept))||
    (TRAINING_ROLE_IDS[dept]?.instructors||[]).some(id=>
      ctx.verifiedRoleIds.includes(id))||
    (TRAINING_ROLE_IDS[dept]?.leadership||[]).some(id=>
      ctx.verifiedRoleIds.includes(id)));
  const eventSummary=(doc)=>({
    id:doc.id,department:doc.department,courseName:doc.courseName,
    startAt:doc.startAt,endAt:doc.endAt,location:doc.location,
    status:doc.status,organizerName:doc.organizerName||'',
    imageAssetCode:doc.imageAssetCode||null
    // Never expose applicant ID, private note or evaluation in shared calendar.
  });
  // Published events from all services are visible across the whole portal.
  app.get('/api/training-calendar',identity,async(req,res)=>{
    try{
      const rows=await db().collection('bpd_training_calendar_events')
        .where('startAt','>=',String(new Date().getUTCFullYear()-1)+'-01-01T00:00:00.000Z')
        .orderBy('startAt').limit(350).get();
      const result=rows.docs.map(d=>eventSummary({id:d.id,...d.data()}))
        .filter(d=>['gepland','uitgevoerd'].includes(d.status));
      const canScheduleDepartments=TRAINING_REQUEST_DEPARTMENTS
        .filter(dept=>scheduleScope(req.trainingApplicant,dept));
      res.json({events:result,canScheduleDepartments,limited:rows.docs.length===350});
    }catch(e){error(res,e)}
  });
  // Authorized instructors/leaders can publish a standalone course without
  // manufacturing a trainee request. Enrollment can be linked later.
  app.post('/api/training-calendar',identity,async(req,res)=>{
    try{
      const ctx=req.trainingApplicant;
      const dept=String(req.body?.department||'');
      if(!TRAINING_REQUEST_DEPARTMENTS.includes(dept)||!scheduleScope(ctx,dept))
        throw rejection('Geen opleidingsplanningsrecht voor deze dienst');
      const allowed=['department','courseName','startAt','endAt','location'];
      if(!req.body||Object.keys(req.body).some(key=>!allowed.includes(key)))
        throw rejection('Ongeldige gegevens voor de opleidingskalender',400);
      const courseName=String(req.body.courseName||'').trim();
      if(courseName.length<3||courseName.length>150)
        throw rejection('Opleidingsnaam moet tussen 3 en 150 tekens bevatten',400);
      let plan;
      try{plan=validTrainingSchedule({startAt:req.body.startAt,endAt:req.body.endAt,
        location:req.body.location});}
      catch(e){throw rejection(e.message,400)}
      const who=ctx.persons.find(p=>p.dept===dept);
      const ref=db().collection('bpd_training_calendar_events').doc();
      const by={discordId:ctx.id,name:who?.name||'',call:who?.call||''};
      const stamp=FieldValue.serverTimestamp();
      const audit=ref.collection('audit').doc();
      const activity=db().collection('bpd_cases')
        .doc(dept+'_'+ctx.id).collection('entries').doc();
      await db().runTransaction(async tx=>{
        tx.create(ref,{
          department:dept,courseName,...plan,status:'gepland',
          organizerId:ctx.id,organizerName:String(who?.name||'Instructeur').slice(0,100),
          imageAssetCode:null,requestId:null,createdBy:by,
          createdAt:stamp,updatedAt:stamp
        });
        tx.create(audit,{action:'aangekondigd',by,at:stamp});
        tx.create(activity,{
          type:'activiteit',dept,subjectDiscordId:ctx.id,
          subjectNameAtCreation:who?.name||'',
          subjectCallAtCreation:who?.call||'',eventDate:localDay(),
          courseName:null,reportCategory:'activiteit',
          details:'Opleiding aangekondigd · '+courseName+' · '+plan.startAt+
            ' · '+plan.location+' · kalender '+ref.id,
          trainingCalendarId:ref.id,registeredBy:by,
          submittedBy:{uid:ctx.uid},createdAt:stamp,modifiedAt:null
        });
      });
      res.status(201).json({saved:true,id:ref.id});
    }catch(e){error(res,e)}
  });
  const exposed=x=>({
    id:x.id,department:x.department,courseName:x.courseName,
    note:x.note||'',applicantDiscordId:x.applicantDiscordId,
    applicantName:x.applicantName,applicantCall:x.applicantCall,
    applicantTier:x.applicantTier||null,series:x.series||null,
    status:x.status,createdAt:iso(x.createdAt),updatedAt:iso(x.updatedAt),
    reviewedBy:x.reviewedBy||null,reviewedAt:iso(x.reviewedAt),
    givenBy:x.givenBy||null,givenAt:iso(x.givenAt),
    plannedBy:x.plannedBy||null,plannedAt:iso(x.plannedAt),
    calendarId:x.calendarId||null,scheduledStartAt:x.scheduledStartAt||null,
    scheduledEndAt:x.scheduledEndAt||null,scheduledLocation:x.scheduledLocation||null,
    rejectedBy:x.rejectedBy||null,rejectionReason:x.rejectionReason||null,
    executedBy:x.executedBy||null,executedAt:iso(x.executedAt)
  });
  app.get('/api/training-requests',identity,async(req,res)=>{
    try{
      const ctx=req.trainingApplicant;
      const mineSnap=await db().collection('bpd_training_requests')
        .where('applicantDiscordId','==',ctx.id).limit(100).get();
      const mine=mineSnap.docs.map(d=>exposed({id:d.id,...d.data()}))
        .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      const scopes=ctx.persons.map(p=>({
        department:p.dept,tier:tierOf(ctx,p),
        courses:requestCourseOptions(p.dept,tierOf(ctx,p)),
        canRequest:maySubmit(ctx,p)
      }));
      const incoming=[];
      let canReviewTraining=false;
      // Normal members only load their own records. Avoid a service-wide
      // Firestore scan on every login; this also protects Firestore quotas.
      for(const person of ctx.persons){
        const dept=person.dept,rank=roleForDepartment(ctx.actor,dept);
        const highPolice=dept==='politie'&&['officierenkader','korpsleiding'].includes(rank);
        const series=personSeries(person);
        const seriesLead=dept==='politie'&&series&&SERIES_LEADERS[series]?.includes(ctx.id);
        const serviceLead=dept!=='politie'&&
          ['middenkader','officierenkader','korpsleiding'].includes(rank);
        const verifiedInstructor=(TRAINING_ROLE_IDS[dept]?.instructors||[])
          .some(id=>ctx.verifiedRoleIds.includes(id));
        if(!highPolice&&!seriesLead&&!serviceLead&&!verifiedInstructor)continue;
        // This is a verified reviewer, even if the current queue is empty.
        canReviewTraining=true;
        let query=db().collection('bpd_training_requests');
        // A reekshoofd sees only the own series. That single-field query
        // uses Firestore's automatic index, without requiring a composite.
        query=seriesLead&&!highPolice?
          query.where('series','==',series):
          query.where('department','==',dept);
        const rows=await query.limit(200).get();
        for(const doc of rows.docs){
          const request={id:doc.id,...doc.data()};
          if(request.department!==dept||
            !([...ACTIVE_TRAINING_REQUEST_STATUSES,'uitgevoerd','gegeven'].includes(request.status)))continue;
          if(reviewScope(ctx,request))incoming.push({...exposed(request),
            readAt:iso(request.readBy?.[ctx.id]),
            canSchedule:scheduleScope(ctx,request.department)});
        }
      }
      incoming.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      res.json({scopes,mine,canReviewTraining,incoming:incoming.slice(0,200)});
    }catch(e){error(res,e)}
  });
  app.post('/api/training-requests',identity,async(req,res)=>{
    try{
      const ctx=req.trainingApplicant,dept=String(req.body?.department||'');
      if(!TRAINING_REQUEST_DEPARTMENTS.includes(dept))
        throw rejection('Onbekende hulpdienst',400);
      const person=applicant(ctx,dept);
      if(!person)throw rejection('Geen eenduidige personeelsfiche voor deze hulpdienst');
      const tier=tierOf(ctx,person);
      if(!maySubmit(ctx,person))
        throw rejection('Geen aanvraagrecht in dit kader');
      let form;
      try{form=validateTrainingRequestInput(req.body,requestCourseOptions(dept,tier),tier)}
      catch(e){throw rejection(e.message,400)}
      const ref=db().collection('bpd_training_requests').doc();
      const stamp=FieldValue.serverTimestamp();
      const activity=db().collection('bpd_cases')
        .doc(dept+'_'+ctx.id).collection('entries').doc();
      const actor={discordId:ctx.id,name:person.name||'',
        call:person.call||''};
      await db().runTransaction(async tx=>{
        tx.create(ref,{
          department:dept,applicantDiscordId:ctx.id,
          applicantName:String(person.name||'').slice(0,100),
          applicantCall:String(person.call||'').slice(0,30),
          applicantTier:tier,series:personSeries(person),
          courseName:form.courseName,isVaria:form.isVaria,
          note:form.note,status:'nieuw',createdAt:stamp,updatedAt:stamp
        });
        tx.create(ref.collection('audit').doc(),{
          action:'aangevraagd',previousStatus:null,nextStatus:'nieuw',
          by:actor,at:stamp
        });
        tx.create(activity,{
          type:'activiteit',dept,subjectDiscordId:ctx.id,
          subjectNameAtCreation:person.name||'',
          subjectCallAtCreation:person.call||'',
          eventDate:localDay(),
          courseName:null,
          details:'Opleiding aangevraagd · '+form.courseName+' · aanvraag '+ref.id,
          reportCategory:'activiteit',trainingRequestId:ref.id,
          registeredBy:actor,submittedBy:{uid:ctx.uid},
          createdAt:stamp,modifiedAt:null
        });
      });
      return res.status(201).json({saved:true,id:ref.id,status:'nieuw'});
    }catch(e){error(res,e)}
  });
  app.post('/api/training-requests/:id/action',identity,async(req,res)=>{
    const id=String(req.params.id||'');
    if(!/^[A-Za-z0-9]{12,40}$/.test(id))
      return res.status(400).json({error:'Ongeldige aanvraagverwijzing'});
    const body=req.body||{},action=body.action;
    if(!['gelezen','gepland','afgewezen','uitgevoerd','wissen'].includes(action))
      return res.status(400).json({error:'Ongeldige actie'});
    const permitted=action==='gepland'?['action','startAt','endAt','location']:
      action==='afgewezen'?['action','reason']:
      action==='uitgevoerd'?['action','attendanceConfirmed']:
      ['action'];
    if(Object.keys(body).some(k=>!permitted.includes(k)))
      return res.status(400).json({error:'Ongeldige bijkomende gegevens'});
    let schedule=null,reason='';
    if(action==='gepland'){
      try{schedule=validTrainingSchedule({
        startAt:body.startAt,endAt:body.endAt,location:body.location
      });}catch(e){return res.status(400).json({error:e.message})}
    }
    if(action==='afgewezen'){
      reason=typeof body.reason==='string'?body.reason.trim():'';
      if(reason.length<5||reason.length>400)
        return res.status(400).json({error:'Motivatie afwijzing: 5 tot 400 tekens'});
    }
    if(action==='uitgevoerd'&&body.attendanceConfirmed!==true)
      return res.status(400).json({error:'Bevestig eerst de effectieve deelname'});
    try{
      const ctx=req.trainingApplicant;
      const ref=db().collection('bpd_training_requests').doc(id);
      const calendar=db().collection('bpd_training_calendar_events').doc(id);
      const changed=await db().runTransaction(async tx=>{
        const request=await tx.get(ref);
        if(!request.exists)throw rejection('Aanvraag niet gevonden',404);
        const old=request.data();
        if(!reviewScope(ctx,old))throw rejection('Geen toegang tot deze reeks of dienst');
        // GELEZEN is personal, not a shared workflow status. Keep existing
        // decisions/planning untouched for every other recipient.
        if(action==='gelezen'){
          if(old.status==='gewist')throw rejection('Aanvraag is gearchiveerd',409);
          if(!old.readBy?.[ctx.id]){
            const who=ctx.persons.find(p=>p.dept===old.department);
            if(!who)throw rejection('Eigen personeelsfiche niet gevonden',403);
            const by={discordId:ctx.id,name:who.name,call:who.call};
            const now=FieldValue.serverTimestamp();
            tx.update(ref,{['readBy.'+ctx.id]:now});
            tx.create(ref.collection('audit').doc(),{
              action:'persoonlijk-gelezen',by,at:now,status:old.status
            });
          }
          return old.status;
        }
        if(['gepland','uitgevoerd'].includes(action)&&
           !scheduleScope(ctx,old.department))
          throw rejection('Alleen bevoegde instructeurs of dienstleiding kunnen plannen/uitvoeren');
        let status;
        try{status=nextTrainingRequestStatus(old.status,action)}
        catch(e){throw rejection(e.message,409)}
        // Transactional guard: a session may never be silently overwritten.
        const eventSnap=['gepland','uitgevoerd'].includes(action)?
          await tx.get(calendar):null;
        if(action==='gepland'&&eventSnap.exists)
          throw rejection('Deze opleiding is al in de kalender opgenomen',409);
        if(action==='uitgevoerd'&&
           (!eventSnap.exists||eventSnap.get('status')!=='gepland'||
             eventSnap.get('requestId')!==id||
             Date.parse(eventSnap.get('startAt')||'')>Date.now()))
          throw rejection('Geen geldige geplande opleiding gevonden',409);
        const trainees=ctx.snapshot.filter(p=>p.dept===old.department&&
          p.personId===old.applicantDiscordId);
        if(trainees.length!==1)throw rejection('Personeelsfiche is niet eenduidig',409);
        const who=ctx.persons.find(p=>p.dept===old.department);
        if(!who)throw rejection('Eigen personeelsfiche niet gevonden',403);
        const now=FieldValue.serverTimestamp();
        const by={discordId:ctx.id,name:who.name,call:who.call};
        const changes={status,updatedAt:now};
        if(action==='gelezen'){changes.reviewedAt=now;changes.reviewedBy=by}
        if(action==='gepland'){
          Object.assign(changes,{plannedAt:now,plannedBy:by,calendarId:id,
            scheduledStartAt:schedule.startAt,scheduledEndAt:schedule.endAt,
            scheduledLocation:schedule.location});
          tx.create(calendar,{
            requestId:id,department:old.department,courseName:old.courseName,
            ...schedule,status:'gepland',organizerId:ctx.id,
            organizerName:who.name,imageAssetCode:null,createdBy:by,
            createdAt:now,updatedAt:now
          });
        }
        if(action==='afgewezen'){changes.rejectedAt=now;changes.rejectedBy=by;
          changes.rejectionReason=reason}
        if(action==='uitgevoerd'){
          changes.executedAt=now;changes.executedBy=by;
          changes.attendanceConfirmed=true;
          tx.update(calendar,{status:'uitgevoerd',updatedAt:now,
            confirmedAt:now,confirmedBy:by});
        }
        if(action==='wissen'){changes.deletedAt=now;changes.deletedBy=by}
        const label={
          gelezen:'Opleidingsaanvraag gelezen',
          gepland:'Opleiding gepland',
          afgewezen:'Opleidingsaanvraag afgewezen',
          uitgevoerd:'Opleiding uitgevoerd · deelname bevestigd',
          wissen:'Uit actieve aanvragen gearchiveerd'
        }[action];
        tx.update(ref,changes);
        tx.create(ref.collection('audit').doc(),{
          action,previousStatus:old.status,nextStatus:status,
          reason:reason||null,
          scheduledStartAt:schedule?.startAt||old.scheduledStartAt||null,
          by,at:now
        });
        const activity=db().collection('bpd_cases')
          .doc(old.department+'_'+old.applicantDiscordId)
          .collection('entries').doc();
        tx.create(activity,{
          type:action==='uitgevoerd'?'opleiding':'activiteit',
          dept:old.department,subjectDiscordId:old.applicantDiscordId,
          subjectNameAtCreation:trainees[0].name,
          subjectCallAtCreation:trainees[0].call,
          eventDate:localDay(),
          courseName:action==='uitgevoerd'?old.courseName:null,
          details:label+' · '+old.courseName+' · aanvraag '+id+
            (schedule?' · '+schedule.startAt+' · '+schedule.location:'')+
            (reason?' · reden: '+reason:''),
          reportCategory:action==='uitgevoerd'?'opleiding':'activiteit',
          trainingRequestId:id,registeredBy:by,submittedBy:{uid:ctx.uid},
          createdAt:now,modifiedAt:null
        });
        return status;
      });
      res.json({saved:true,status:changed});
    }catch(e){error(res,e)}
  });

}
