import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {subjectPoliceGrade} from './notification-policy.js';
import {calendarDays,validDiscordId,validateLeaveRequest,mayApproveLeave,
  mayManageGrants,highCadreDepartments,validateGrant,activeGrant,normalizeEmail,roleForDepartment} from './leave-policy.js';

const coll='bpd_leave_requests';
const grants='bpd_leave_grants';
const stamp=()=>new Date().toISOString();
const yyyyMmDd=()=>new Date().toISOString().slice(0,10);
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
    days:d.days,status:d.status,createdAt:iso(d.createdAt),decidedAt:iso(d.decidedAt),
    ...(showNote?{note:d.note||''}:{})};
};
const personRecords=(rows,id)=>rows.filter(p=>p.personId===id);
const departmentsOf=records=>[...new Set(records.map(p=>p.dept).filter(Boolean))];
const gradeFor=(records,id)=>{const matches=records.filter(p=>p.dept==='politie'&&p.personId===id);
  return matches.length===1?subjectPoliceGrade(matches[0]):null;};
const projected=(record,roster)=>record.subjectDepartments?.includes('politie')?
  {...record,subjectPoliceGrade:gradeFor(roster,record.personDiscordId)}:record;
// Geen volwaardige centrale personeelsnummerdatabase in dit project: Discord ID is
// voorlopig de migratiebrug. Een toekomstig BPD-nummer mag deze sleutel niet vervangen.
export function installLeaveRoutes(app,{requireUser,getSnapshot,accessList}){
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
  async function grantFor(uid){
    const doc=await db().collection(grants).doc(uid).get();
    return doc.exists?doc.data():null;
  }
  app.get('/api/leave/me',requireUser,async(req,res)=>{
    try {
      const {departments}=await context(req),grant=activeGrant(await grantFor(req.bpd.uid));
      return res.json({role:req.bpd.role,departments,departmentRoles:req.bpd.departmentRoles,discordId:req.bpd.discordId,
        grant:grant?{level:grant.level,startsOn:grant.startsOn,expiresOn:grant.expiresOn}:null,
        canManageGrants:mayManageGrants(req.bpd),writesEnabled:writes()});
    }catch(e){return jsonError(res,e)}
  });
  app.get('/api/leave/requests',requireUser,async(req,res)=>{
    try {
      const {departments,snapshot}=await context(req),leave=db().collection(coll);
      const grant=activeGrant(await grantFor(req.bpd.uid));
      const my=await leave.where('personDiscordId','==',req.bpd.discordId).limit(100).get();
      let review=[];
      if(grant){
        const all=await leave.limit(250).get();
        review=all.docs.filter(d=>d.get('status')==='pending'&&d.get('personDiscordId')!==req.bpd.discordId);
      } else if(req.bpd.departments.length===1 || Object.keys(req.bpd.departmentRoles||{}).length){
        const permitted=departments.filter(d=>req.bpd.departments.includes(d));
        const lists=await Promise.all(permitted.map(dept=>leave.where('subjectDepartments','array-contains',dept).limit(100).get()));
        review=[...new Map(lists.flatMap(x=>x.docs).filter(d=>d.get('status')==='pending').map(d=>[d.id,d])).values()];
      }
      review=review.filter(d=>mayApproveLeave(req.bpd,projected(d.data(),snapshot),grant));
      const byTime=(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''));
      return res.json({mine:my.docs.map(d=>item(d,true)).sort(byTime),
        toReview:review.map(d=>item(d,false)).sort(byTime),
        limited:my.docs.length===100||review.length>=100});
    }catch(e){return jsonError(res,e)}
  });
  // Dossierweergave per hulpdienst: enkel kalenderdata/status, GEEN reden of
  // vertrouwelijke beslissing. Een medewerker mag zijn eigen verlof zien.
  app.get('/api/leave/person/:discordId',requireUser,async(req,res)=>{
    const personId=String(req.params.discordId||''),dept=String(req.query.dept||'');
    if(!validDiscordId(personId))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const {snapshot}=await context(req);
      const records=personRecords(snapshot,personId);
      if(!records.some(p=>p.dept===dept))return res.status(404).json({error:'Geen lidmaatschap gevonden'});
      const self=personId===req.bpd.discordId;
      const cadre=['middenkader','officierenkader','korpsleiding'].includes(roleForDepartment(req.bpd,dept));
      if(!self&&(!cadre||!req.bpd.departments.includes(dept)))
        return res.status(403).json({error:'Geen toegang tot deze hulpdienst'});
      const snap=await db().collection(coll).where('personDiscordId','==',personId).limit(100).get();
      const grant=activeGrant(await grantFor(req.bpd.uid));
      const selected=snap.docs.filter(d=>{
        const record=d.data();
        return Array.isArray(record.subjectDepartments)&&record.subjectDepartments.includes(dept)&&
          (record.status==='approved'||(record.status==='pending'&&
            (self||mayApproveLeave(req.bpd,projected(record,snapshot),grant))));
      });
      res.json({personDiscordId:personId,dept,
        leaves:selected.map(d=>{
          const record=d.data();
          const canDecide=mayApproveLeave(req.bpd,projected(record,snapshot),grant);
          return {id:d.id,startDate:record.startDate,endDate:record.endDate,
            days:record.days,status:record.status,manual:record.manual===true,
            canDecide:canDecide&&writes()};
        }),limited:snap.docs.length===100});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/requests',requireUser,requireWrites,async(req,res)=>{
    try {
      const {records}=await context(req),details=validateLeaveRequest(req.body);
      const id=req.bpd.discordId;
      const subjectName=records.find(p=>req.bpd.departments.includes(p.dept))?.name||'Onbekend personeelslid';
      const ref=db().collection(coll).doc(`${id}_${details.startDate}_${details.endDate}`);
      const subjectDepartments=departmentsOf(records);
      if(!subjectDepartments.length)throw rejection('Geen actieve hulpdiensten gevonden',403);
      try{
        await ref.create({...details,personDiscordId:id,subjectName,subjectDepartments,
          status:'pending',submittedByUid:req.bpd.uid,submittedByDiscordId:id,
          createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      }catch(e){if(e.code===6||e.code==='already-exists')throw rejection('Voor deze exacte periode bestaat al een aanvraag',409);throw e}
      return res.status(201).json({id:ref.id,status:'pending',days:details.days});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/requests/:id/decision',requireUser,requireWrites,async(req,res)=>{
    if(!validId(req.params.id))return res.status(400).json({error:'Ongeldig aanvraagnummer'});
    const decision=req.body?.decision;
    if(!['approved','rejected'].includes(decision))return res.status(400).json({error:'Ongeldige beslissing'});
    const note=req.body?.note===undefined?'':req.body.note;
    if(typeof note!=='string'||note.trim().length>300)return res.status(400).json({error:'Beslissingsnotitie te lang'});
    try{
      await context(req);
      const ref=db().collection(coll).doc(req.params.id),grantRef=db().collection(grants).doc(req.bpd.uid);
      await db().runTransaction(async tx=>{
        const [request,grantDoc]=await Promise.all([tx.get(ref),tx.get(grantRef)]);
        if(!request.exists)throw rejection('Verlofaanvraag niet gevonden',404);
        const d=request.data();
        if(d.status!=='pending')throw rejection('Aanvraag is al behandeld',409);
        if(!mayApproveLeave(req.bpd,d,grantDoc.exists?grantDoc.data():null))
          throw rejection('Geen bevoegdheid om dit verlof goed te keuren',403);
        const audit=ref.collection('audit').doc();
        tx.update(ref,{status:decision,decidedByUid:req.bpd.uid,decidedByDiscordId:req.bpd.discordId,
          decidedAt:FieldValue.serverTimestamp(),decisionNote:note.trim(),updatedAt:FieldValue.serverTimestamp()});
        tx.create(audit,{action:decision,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp(),note:note.trim(),days:calendarDays(d.startDate,d.endDate)});
      });
      return res.json({ok:true,status:decision});
    }catch(e){return jsonError(res,e)}
  });
  // A cadre member records a manually approved leave in the EXISTING collection.
  // Same permissions and maximum days as the existing approval workflow.
  app.post('/api/leave/manual',requireUser,requireWrites,async(req,res)=>{
    if(process.env.BPD_ENABLE_PERSONNEL_MANUAL_LEAVE!=='true')
      return res.status(503).json({error:'Handmatige verlofregistratie staat nog niet open'});
    const dept=String(req.body?.dept||''),personId=String(req.body?.discordId||'');
    if(!validDiscordId(personId)||!['politie','ambulance','brandweer','depannage'].includes(dept))
      return res.status(400).json({error:'Ongeldige dienst of personeelsreferentie'});
    let details;
    try{details=validateLeaveRequest(req.body)}
    catch(e){return res.status(400).json({error:e.message})}
    try{
      const {snapshot}=await context(req);
      const matched=snapshot.filter(p=>p.dept===dept&&p.personId===personId);
      if(matched.length!==1)throw rejection('Geen eenduidige personeelsfiche gevonden',404);
      const pending={personDiscordId:personId,subjectDepartments:[dept],status:'pending',
        startDate:details.startDate,endDate:details.endDate};
      const grant=activeGrant(await grantFor(req.bpd.uid));
      if(!mayApproveLeave(req.bpd,pending,grant))
        throw rejection('Je mag deze verlofperiode niet zelfstandig goedkeuren',403);
      const id='manual_'+dept+'_'+personId+'_'+details.startDate+'_'+details.endDate;
      const ref=db().collection(coll).doc(id);
      await db().runTransaction(async tx=>{
        const previous=await tx.get(ref);
        if(previous.exists)throw rejection('Deze exacte verlofregistratie bestaat al',409);
        tx.create(ref,{...details,manual:true,personDiscordId:personId,
          subjectName:matched[0].name,subjectDepartments:[dept],
          status:'approved',submittedByUid:req.bpd.uid,submittedByDiscordId:req.bpd.discordId,
          decidedByUid:req.bpd.uid,decidedByDiscordId:req.bpd.discordId,
          createdAt:FieldValue.serverTimestamp(),decidedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{action:'manual_approved',
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
          note:details.note,days:details.days,at:FieldValue.serverTimestamp()});
      });
      return res.status(201).json({id,status:'approved',days:details.days,manual:true});
    }catch(e){return jsonError(res,e)}
  });
  app.get('/api/leave/grants',requireUser,async(req,res)=>{
    try{
      await context(req);
      if(!mayManageGrants(req.bpd))return res.status(403).json({error:'Geen machtigingsrechten'});
      const data=await db().collection(grants).limit(100).get();
      return res.json({grants:data.docs.filter(d=>
        Array.isArray(d.get('grantDepartments')) && d.get('grantDepartments').some(dept=>highCadreDepartments(req.bpd).includes(dept)))
        .map(d=>({email:d.get('email'),level:d.get('level'),
        startsOn:d.get('startsOn'),expiresOn:d.get('expiresOn'),revoked:Boolean(d.get('revoked'))}))});
    }catch(e){return jsonError(res,e)}
  });
  app.post('/api/leave/grants',requireUser,requireWrites,async(req,res)=>{
    try{
      await context(req);
      if(!mayManageGrants(req.bpd))throw rejection('Alleen officierenkader of korpsleiding kan verlofmachtigingen toekennen',403);
      const grant=validateGrant(req.body);
      if(grant.email===req.bpd.email)throw rejection('Je kunt jezelf geen aanvullende machtiging geven',403);
      const target=accessList()[grant.email];
      if(!target||!Array.isArray(target.departments)||!target.departments.some(d=>highCadreDepartments(req.bpd).includes(d)))
        throw rejection('Doelaccount behoort niet tot een gezamenlijk gemachtigde hulpdienst',403);
      const user=await getAuth().getUserByEmail(grant.email);
      if(!user.emailVerified || !user.providerData.some(p=>p.providerId==='google.com'))
        throw rejection('Doelaccount heeft nog geen geverifieerde Google-aanmelding',403);
      const grantDepartments=target.departments.filter(d=>highCadreDepartments(req.bpd).includes(d));
      const ref=db().collection(grants).doc(user.uid),audit=ref.collection('audit').doc();
      const batch=db().batch();
      batch.set(ref,{...grant,grantDepartments,revoked:false,grantedByUid:req.bpd.uid,grantedAt:FieldValue.serverTimestamp()});
      batch.create(audit,{action:'grant',...grant,byUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
      await batch.commit();
      return res.status(201).json({ok:true,level:grant.level,expiresOn:grant.expiresOn});
    }catch(e){
      if(e?.code==='auth/user-not-found')return res.status(404).json({error:'Dit account moet zich eerst met Google aanmelden'});
      return jsonError(res,e);
    }
  });
  app.post('/api/leave/grants/revoke',requireUser,requireWrites,async(req,res)=>{
    try{
      await context(req);
      if(!mayManageGrants(req.bpd))throw rejection('Geen machtigingsrechten',403);
      const email=normalizeEmail(req.body?.email);
      if(email===req.bpd.email)throw rejection('Je kunt je eigen machtiging hier niet aanpassen',403);
      const user=await getAuth().getUserByEmail(email),ref=db().collection(grants).doc(user.uid);
      await db().runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists||current.get('email')!==email)throw rejection('Machtiging niet gevonden',404);
        if(!Array.isArray(current.get('grantDepartments'))||
          !current.get('grantDepartments').some(d=>highCadreDepartments(req.bpd).includes(d)))
          throw rejection('Geen bevoegdheid voor deze machtiging',403);
        const audit=ref.collection('audit').doc();
        tx.update(ref,{revoked:true,revokedAt:FieldValue.serverTimestamp(),revokedByUid:req.bpd.uid});
        tx.create(audit,{action:'revoke',byUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true});
    }catch(e){if(e?.code==='auth/user-not-found')return res.status(404).json({error:'Geen gebruiker gevonden'});return jsonError(res,e)}
  });
}
