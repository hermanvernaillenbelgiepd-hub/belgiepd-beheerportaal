import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {approvedManagedEntry,USER_COLLECTION,verifiedDiscordIdentity} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';
import {
  TRAINING_REQUEST_DEPARTMENTS,policeRequestTier,personSeries,
  requestCourseOptions,canSubmitTrainingRequest,mayReviewTrainingRequest,
  validateTrainingRequestInput,nextTrainingRequestStatus
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
      req.trainingApplicant={id,uid:decoded.uid,persons,actor,snapshot:snapshot.data};
      next();
    }catch(e){error(res,e)}
  }
  const applicant=(ctx,dept)=>ctx.persons.filter(p=>p.dept===dept).length===1?
    ctx.persons.find(p=>p.dept===dept):null;
  const tierOf=(ctx,person)=>person.dept==='politie'?policeRequestTier(person):null;
  const reviewScope=(ctx,request)=>mayReviewTrainingRequest(ctx.actor,request) ||
    // Reekshoofden mogen uitsluitend aanvragen uit hun eigen reeks bekijken.
    // Hun IDs zijn centraal vastgelegd, niet vanuit de browser opgegeven.
    (request.department==='politie'&&ctx.persons.some(p=>p.dept==='politie')&&
      mayReviewTrainingRequest({
        ...ctx.actor,departments:['politie'],
        departmentRoles:{politie:'basiskader'}
      },request));
  const exposed=x=>({
    id:x.id,department:x.department,courseName:x.courseName,
    note:x.note||'',applicantDiscordId:x.applicantDiscordId,
    applicantName:x.applicantName,applicantCall:x.applicantCall,
    applicantTier:x.applicantTier||null,series:x.series||null,
    status:x.status,createdAt:iso(x.createdAt),updatedAt:iso(x.updatedAt),
    reviewedBy:x.reviewedBy||null,reviewedAt:iso(x.reviewedAt),
    givenBy:x.givenBy||null,givenAt:iso(x.givenAt)
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
        canRequest:canSubmitTrainingRequest(p,tierOf(ctx,p),
          roleForDepartment(ctx.actor,p.dept))
      }));
      const incoming=[];
      // Query is scoped to departments already present in the verifiable
      // personnel roster. Final row-level permission checks happen server-side.
      for(const department of new Set(ctx.actor.departments.concat(
        ctx.persons.some(p=>p.dept==='politie')?['politie']:[]))){
        const rows=await db().collection('bpd_training_requests')
          .where('department','==',department).limit(200).get();
        for(const doc of rows.docs){
          const request={id:doc.id,...doc.data()};
          if(request.status!=='gewist'&&reviewScope(ctx,request))
            incoming.push(exposed(request));
        }
      }
      incoming.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      res.json({scopes,mine,incoming:incoming.slice(0,200)});
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
      if(!canSubmitTrainingRequest(person,tier,roleForDepartment(ctx.actor,dept)))
        throw rejection('Geen aanvraagrecht in dit kader');
      const form=validateTrainingRequestInput(req.body,
        requestCourseOptions(dept,tier),tier);
      const ref=db().collection('bpd_training_requests').doc();
      await ref.create({
        department:dept,applicantDiscordId:ctx.id,
        applicantName:String(person.name||'').slice(0,100),
        applicantCall:String(person.call||'').slice(0,30),
        applicantTier:tier,series:personSeries(person),
        courseName:form.courseName,isVaria:form.isVaria,
        note:form.note,status:'nieuw',
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()
      });
      return res.status(201).json({saved:true,id:ref.id,status:'nieuw'});
    }catch(e){error(res,e)}
  });
  app.post('/api/training-requests/:id/action',identity,async(req,res)=>{
    const id=String(req.params.id||'');
    if(!/^[A-Za-z0-9]{12,40}$/.test(id))
      return res.status(400).json({error:'Ongeldige aanvraagverwijzing'});
    const action=req.body?.action;
    if(!['gelezen','gegeven','wissen'].includes(action)||
      Object.keys(req.body||{}).some(k=>k!=='action'))
      return res.status(400).json({error:'Ongeldige actie'});
    try{
      const ctx=req.trainingApplicant;
      const ref=db().collection('bpd_training_requests').doc(id);
      const changed=await db().runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists)throw rejection('Aanvraag niet gevonden',404);
        const old=current.data();
        if(!reviewScope(ctx,old))throw rejection('Je mag deze aanvraag niet behandelen');
        let status;
        try{status=nextTrainingRequestStatus(old.status,action)}
        catch(e){throw rejection(e.message,409)}
        const person=ctx.snapshot.filter(p=>p.dept===old.department&&
          p.personId===old.applicantDiscordId);
        if(person.length!==1)throw rejection('Personeelsfiche is niet eenduidig',409);
        const who=ctx.snapshot.find(p=>p.personId===ctx.id&&p.dept===old.department);
        if(!who)throw rejection('Je eigen personeelsfiche is niet gevonden');
        const stamp=FieldValue.serverTimestamp();
        const by={discordId:ctx.id,name:who.name,call:who.call};
        const update={status,updatedAt:stamp};
        if(action==='gelezen'){update.reviewedAt=stamp;update.reviewedBy=by}
        if(action==='gegeven'){update.givenAt=stamp;update.givenBy=by}
        if(action==='wissen'){update.deletedAt=stamp;update.deletedBy=by}
        const audit=ref.collection('audit').doc();
        const activity=db().collection('bpd_cases')
          .doc(old.department+'_'+old.applicantDiscordId)
          .collection('entries').doc();
        const isGiven=action==='gegeven';
        const label=action==='gelezen'?'Opleidingsaanvraag gelezen':
          isGiven?'Opleiding gegeven':'Opleidingsaanvraag gewist';
        tx.update(ref,update);
        tx.create(audit,{action,previousStatus:old.status,nextStatus:status,
          by,at:stamp});
        tx.create(activity,{
          type:isGiven?'opleiding':'activiteit',
          dept:old.department,subjectDiscordId:old.applicantDiscordId,
          subjectNameAtCreation:person[0].name,
          subjectCallAtCreation:person[0].call,
          eventDate:localDay(),courseName:isGiven?old.courseName:null,
          details:label+' · '+old.courseName+' · aanvraag '+id,
          reportCategory:isGiven?'opleiding':'activiteit',
          trainingRequestId:id,registeredBy:by,submittedBy:{uid:ctx.uid},
          createdAt:stamp,modifiedAt:null
        });
        return status;
      });
      res.json({saved:true,status:changed});
    }catch(e){error(res,e)}
  });
}
