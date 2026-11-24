// Flag-gated service applications. Candidate OAuth is independent of staff
// accounts; every service-lead review repeats the current dossier authorization.
// No route provisions personnel, callsigns, permissions, or Discord roles.
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {timingSafeEqual} from 'node:crypto';
import {verifiedDiscordIdentity,USER_COLLECTION} from './user-access.js';
import {
 SERVICE_APPLICATION_DEPARTMENTS,SERVICE_APPLICATION_COLLECTION,
 SERVICE_EVIDENCE_COLLECTION,serviceApplicationsReady,serviceEvidenceIngestReady,
 applicationKey,cleanServiceApplication,cleanServiceDecision,
 nextServiceApplicationStatus,canViewServiceApplications,
 canReviewServiceApplications,normalizeServiceEvidenceBody,signServiceEvidence,
 evaluateSignedServiceEvidence,publicServiceApplication
} from './service-applications-policy.js';
const ID=/^\d{15,22}$/;
const denied=(res,status,message)=>res.status(status).json({error:message});
const issue=(message,status=403)=>Object.assign(Error(message),{status});
const safeDate=value=>value?.toDate?.()?.toISOString?.()||
 typeof value==='string'?value:null;
function safeApplication(doc){
 const result=publicServiceApplication(doc);
 if(!result)return null;
 return {...result,createdAt:typeof result.createdAt==='string'?result.createdAt:result.createdAt?.toDate?.()?.toISOString()||null,
  updatedAt:typeof result.updatedAt==='string'?result.updatedAt:result.updatedAt?.toDate?.()?.toISOString()||null};
}
function evidenceStateFromDoc(data,id,env,now){
 return evaluateSignedServiceEvidence(data,id,env.BPD_FIVEM_EVIDENCE_SECRET,now);
}
const statusOpen=env=>serviceApplicationsReady(env);
const restricted=env=>({enabled:statusOpen(env),departments:SERVICE_APPLICATION_DEPARTMENTS,
 applicationsRequireTrustedEvidence:true,automaticPersonnelEntry:false,
 automaticDiscordRoles:false});
export function installServiceApplicationRoutes(app,{
 requireReviewer,getSnapshot,
 verifyToken=token=>getAuth().verifyIdToken(token),
 getMember=id=>getFirestore().collection('bpd_discord_auth').doc(id).get(),
 getAccount=id=>getFirestore().collection(USER_COLLECTION).doc(id).get(),
 dbFactory=getFirestore,env=process.env,now=()=>new Date()
}={}){
 async function ownDiscord(req,res,next){
  res.set('Cache-Control','private, no-store');
  const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
  if(!bearer)return denied(res,401,'Meld je aan via je eigen Discord-account');
  let decoded;
  try{decoded=await verifyToken(bearer)}
  catch{return denied(res,401,'Discord-aanmelding verlopen of ongeldig')}
  const id=decoded?.uid?.startsWith('discord:')?decoded.uid.slice(8):'';
  if(!ID.test(id))return denied(res,403,'Een persoonlijke Discord-login is vereist');
  let member,account;
  try{[member,account]=await Promise.all([getMember(id),getAccount(id)])}
  catch{return denied(res,503,'Discord-gegevens tijdelijk niet controleerbaar')}
  if(verifiedDiscordIdentity(decoded,member?.data?.(),env.DISCORD_GUILD_ID,now().getTime())!==id)
   return denied(res,403,'Discord-lidmaatschap moet opnieuw worden geverifieerd');
  if(account?.data?.()?.status==='blocked')
   return denied(res,403,'Je portaalaccount is geblokkeerd');
  req.serviceApplicant={id,uid:decoded.uid};
  return next();
 }
 async function reviewScope(req,res,next){
  res.set('Cache-Control','private, no-store');
  if(!statusOpen(env))return res.json({...restricted(env),cases:[],reviewer:false});
  const dept=String(req.query?.dept||req.params?.dept||'');
  if(!SERVICE_APPLICATION_DEPARTMENTS.includes(dept))
   return denied(res,400,'Ongeldige hulpdienst');
  let roster;
  try{
   const snap=await getSnapshot();
   if(snap?.stale||!Array.isArray(snap?.data))return denied(res,503,'Personeelsbron niet actueel');
   roster=snap.data;
  }catch{return denied(res,503,'Personeelsbron niet beschikbaar')}
  if(!canViewServiceApplications(req.bpd,dept,roster))
   return denied(res,403,'Geen inzage in sollicitaties van deze hulpdienst');
  req.serviceReviewer={dept,roster,canDecide:canReviewServiceApplications(req.bpd,dept,roster)};
  next();
 }
 app.get('/api/service-applications/status',(_req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({...restricted(env),ingestConfigured:serviceEvidenceIngestReady(env)});
 });
 app.get('/api/service-applications/me',ownDiscord,async(req,res)=>{
  if(!statusOpen(env))return res.json({...restricted(env),cases:[],proof:{verified:false,reason:'disabled'}});
  try{
   const db=dbFactory(),id=req.serviceApplicant.id;
   const [evidence,...records]=await Promise.all([
    db.collection(SERVICE_EVIDENCE_COLLECTION).doc(id).get(),
    ...SERVICE_APPLICATION_DEPARTMENTS.map(dept=>
      db.collection(SERVICE_APPLICATION_COLLECTION).doc(applicationKey(dept,id)).get())
   ]);
   const proof=evidenceStateFromDoc(evidence.data(),id,env,now());
   return res.json({...restricted(env),proof,
    cases:records.filter(x=>x.exists).map(x=>safeApplication(x.data()))});
  }catch{return denied(res,503,'Eigen sollicitaties tijdelijk niet beschikbaar')}
 });
 app.post('/api/service-applications/submit',ownDiscord,async(req,res)=>{
  if(!statusOpen(env))return denied(res,503,'Sollicitaties zijn nog gesloten');
  let application;
  try{application=cleanServiceApplication(req.body)}
  catch(e){return denied(res,e.status||400,e.message)}
  const id=req.serviceApplicant.id,db=dbFactory();
  try{
   const proofDoc=await db.collection(SERVICE_EVIDENCE_COLLECTION).doc(id).get();
   const proof=evidenceStateFromDoc(proofDoc.data(),id,env,now());
   if(!proof.eligible)return denied(res,422,
    'Minimaal 10 geverifieerde FiveM-uren en 5 dagen vereist; ontbrekende of oude bewijzen blokkeren indiening');
   const key=applicationKey(application.department,id);
   const ref=db.collection(SERVICE_APPLICATION_COLLECTION).doc(key);
   const audit=ref.collection('audit').doc();
   const at=now().toISOString();
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(old.exists)throw issue('Voor deze dienst bestaat al een sollicitatie',409);
    tx.create(ref,{department:application.department,discordId:id,
     motivation:application.motivation,status:'submitted',revision:1,
     eligibilityVerifiedAt:proof.verifiedAt,createdAt:at,updatedAt:at,
     decisionReason:null,decidedBy:null});
    tx.create(audit,{action:'submitted',by:id,at,reason:'Kandidaat heeft zelf ingediend',
     evidenceCheckedAt:proof.verifiedAt,personnelRightsChanged:false});
   });
   return res.status(201).json({submitted:true,department:application.department,
    status:'submitted',automaticPersonnelEntry:false,automaticDiscordRoles:false});
  }catch(e){return denied(res,e.status||503,e.status?e.message:'Sollicitatie kon niet worden opgeslagen')}
 });
 app.post('/api/service-applications/withdraw',ownDiscord,async(req,res)=>{
  if(!statusOpen(env))return denied(res,503,'Sollicitaties zijn nog gesloten');
  const dept=req.body?.department;
  if(Object.keys(req.body||{}).sort().join(',')!=='department'||
    !SERVICE_APPLICATION_DEPARTMENTS.includes(dept))
   return denied(res,400,'Kies de correcte hulpdienst');
  const id=req.serviceApplicant.id,db=dbFactory(),ref=db.collection(SERVICE_APPLICATION_COLLECTION)
   .doc(applicationKey(dept,id)),at=now().toISOString();
  try{
   await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),data=snap.data();
    if(!snap.exists||!['submitted','reviewing'].includes(data?.status))
     throw issue('Deze sollicitatie kan niet meer worden ingetrokken',409);
    tx.update(ref,{status:'withdrawn',revision:(data.revision||0)+1,updatedAt:at});
    tx.create(ref.collection('audit').doc(),{action:'withdrawn',by:id,at,
     reason:'Op eigen verzoek ingetrokken',personnelRightsChanged:false});
   });
   return res.json({withdrawn:true,department:dept,automaticPersonnelEntry:false});
  }catch(e){return denied(res,e.status||503,e.status?e.message:'Intrekking kon niet worden opgeslagen')}
 });
 app.get('/api/service-applications/review',requireReviewer,reviewScope,async(req,res)=>{
  try{
   const query=await dbFactory().collection(SERVICE_APPLICATION_COLLECTION)
    .where('department','==',req.serviceReviewer.dept).limit(101).get();
   const rows=query.docs.slice(0,100).map(x=>safeApplication(x.data()))
    .filter(Boolean).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
   return res.json({...restricted(env),department:req.serviceReviewer.dept,
    reviewer:true,canDecide:req.serviceReviewer.canDecide,
    cases:rows,limited:query.size>100});
  }catch{return denied(res,503,'Beoordelingswachtrij niet beschikbaar')}
 });
 app.get('/api/service-applications/:dept/:discordId/history',
  requireReviewer,reviewScope,async(req,res)=>{
   if(!ID.test(req.params.discordId))return denied(res,400,'Ongeldige kandidaat');
   try{
    const ref=dbFactory().collection(SERVICE_APPLICATION_COLLECTION)
     .doc(applicationKey(req.params.dept,req.params.discordId));
    const snap=await ref.get();
    if(!snap.exists||snap.get('department')!==req.params.dept)
     return denied(res,404,'Sollicitatie niet gevonden');
    const events=await ref.collection('audit').orderBy('at','desc').limit(40).get();
    return res.json({department:req.params.dept,
     case:safeApplication(snap.data()),
     history:events.docs.map(x=>{const v=x.data();
      return {action:v.action,by:v.by,at:v.at,reason:v.reason}})});
   }catch{return denied(res,503,'Sollicitatiehistoriek niet beschikbaar')}
  });
 app.post('/api/service-applications/:dept/:discordId/decision',
  requireReviewer,reviewScope,async(req,res)=>{
   if(!req.serviceReviewer.canDecide)return denied(res,403,'Alleen bevoegde dienstleiding mag beslissen');
   const {dept,discordId}=req.params;
   if(!ID.test(discordId))return denied(res,400,'Ongeldige kandidaat');
   if(req.bpd.discordId===discordId)return denied(res,403,'Je kunt je eigen sollicitatie niet beoordelen');
   let decision;
   try{decision=cleanServiceDecision(req.body)}
   catch(e){return denied(res,e.status||400,e.message)}
   try{
    const db=dbFactory(),ref=db.collection(SERVICE_APPLICATION_COLLECTION)
     .doc(applicationKey(dept,discordId));
    const at=now().toISOString();
    const result=await db.runTransaction(async tx=>{
     const snap=await tx.get(ref),old=snap.data();
     if(!snap.exists||old?.department!==dept||old.discordId!==discordId)
      throw issue('Sollicitatie niet gevonden',404);
     if(old.revision!==decision.expectedRevision)
      throw issue('Sollicitatie werd ondertussen gewijzigd, vernieuw eerst',409);
     const status=nextServiceApplicationStatus(old.status,decision.action);
     const updated={status,revision:old.revision+1,updatedAt:at,
      decisionReason:decision.reason,decidedBy:req.bpd.discordId};
     tx.update(ref,updated);
     tx.create(ref.collection('audit').doc(),{action:decision.action,
      by:req.bpd.discordId,at,reason:decision.reason,from:old.status,to:status,
      personnelRightsChanged:false,personnelCreated:false,discordRolesChanged:false});
     return {department:dept,status,revision:updated.revision};
    });
    return res.json({...result,personnelCreated:false,discordRolesChanged:false});
   }catch(e){return denied(res,e.status||503,e.status?e.message:'Beoordeling kon niet worden opgeslagen')}
  });
 app.post('/api/service-applications/telemetry',async(req,res)=>{
  if(!serviceEvidenceIngestReady(env))return denied(res,503,'FiveM-bewijsontvangst is niet geactiveerd');
  const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1]||'';
  const secret=env.BPD_FIVEM_EVIDENCE_SECRET;
  if(bearer.length!==secret.length||
    !timingSafeEqual(Buffer.from(bearer),Buffer.from(secret)))
   return denied(res,401,'Ongeldige vertrouwde FiveM-bron');
  let input;
  try{input=normalizeServiceEvidenceBody(req.body,now())}
  catch(e){return denied(res,e.status||400,e.message)}
  const stamp=now().toISOString(),payload={...input,verifiedAt:stamp};
  payload.signature=signServiceEvidence(payload,secret);
  try{
   const db=dbFactory(),ref=db.collection(SERVICE_EVIDENCE_COLLECTION).doc(input.discordId);
   await db.runTransaction(async tx=>{
    const previous=await tx.get(ref),before=previous.data();
    if(before&&before.discordId===input.discordId&&
      before.totalPlaySeconds>input.totalPlaySeconds&&
      evaluateSignedServiceEvidence(before,input.discordId,secret,now()).verified)
      throw issue('FiveM-speeltijdteller daalde; broncontrole vereist',409);
    tx.set(ref,payload);
   });
   return res.status(202).json({accepted:true,source:'trusted_fivem_server',
    verifiedAt:stamp,personnelRightsChanged:false});
  }catch(e){return denied(res,e.status||503,e.status?e.message:'FiveM-bewijs kon niet worden verwerkt')}
 });
}
