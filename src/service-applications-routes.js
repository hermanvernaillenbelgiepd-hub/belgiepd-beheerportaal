import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {verifiedDiscordIdentity} from './user-access.js';
import {bearerToken} from './personnel-link.js';
import {citizenDossiersEnabled,CITIZEN_COLLECTION,citizenInitialData} from './citizen-policy.js';
import {canCreatePersonnel} from './personnel-create.js';
import {APPLICATION_SERVICES,SERVICE_APPLICATIONS_COLLECTION,
  serviceApplicantDossierId,validateServiceApplicationDraft} from './service-applications-policy.js';
import {EVIDENCE_COLLECTION,hasTelemetryKey,safeCompare,validatedTelemetryInput,
  signTrustedTelemetry,verifySignedTelemetry} from './service-applications-evidence.js';

const err=(res,status,message)=>res.status(status).json({error:message});
const ISO=x=>x?.toDate?.().toISOString?.()||null;
const enabled=()=>process.env.BPD_ENABLE_SERVICE_APPLICATIONS==='true';
function friendlyError(res,e){
  if(e?.httpStatus)return err(res,e.httpStatus,e.message);
  console.error('Sollicitatiemodule:',e?.code||e?.message||'interne fout');
  return err(res,503,'Sollicitatiemodule tijdelijk niet beschikbaar');
}
const fail=(httpStatus,message)=>Object.assign(new Error(message),{httpStatus});
async function applicantIdentity(req){
  if(process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN!=='true')
    throw fail(503,'Discord-aanmelding is nog niet beschikbaar');
  const token=bearerToken(req.get('Authorization'));
  if(!token)throw fail(401,'Meld je eerst aan via Discord');
  const decoded=await getAuth().verifyIdToken(token);
  const discordId=String(decoded.uid||'').replace(/^discord:/,'');
  if(!/^\d{15,22}$/.test(discordId))throw fail(403,'Een echte Discord-aanmelding is vereist');
  const snapshot=await getFirestore().collection('bpd_discord_auth').doc(discordId).get();
  const member=snapshot.data();
  if(verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID,Date.now(),15*60*1000)!==discordId)
    throw fail(403,'Vernieuw je Discord-aanmelding om je identiteit te bevestigen');
  return {discordId,username:String(member.username||'Discord-lid').slice(0,80)};
}
function publicDossier(d,id){
  return {id,dept:d.dept,status:d.status,
    motivation:d.motivation,
    createdAt:ISO(d.createdAt),updatedAt:ISO(d.updatedAt),
    decisionReason:d.decisionReason||null,
    decidedAt:ISO(d.decidedAt)};
}
export function installServiceApplicationRoutes(app,{requireUser}){
  app.get('/api/service-applications/status',(_req,res)=>{
    res.json({enabled:enabled(),services:APPLICATION_SERVICES,
      telemetryConnected:hasTelemetryKey(process.env.BPD_FIVEM_EVIDENCE_SECRET),
      requiredPlayHours:10,requiredServerDays:5});
  });

  // This endpoint is for a separate trusted server-side FiveM connector.
  // No applicant, browser or bot-user OAuth tokens are accepted as telemetry.
  app.post('/api/service-applications/telemetry',async(req,res)=>{
    if(process.env.BPD_ENABLE_FIVEM_EVIDENCE_INGEST!=='true'||!enabled())
      return err(res,503,'FiveM-telemetrie is nog niet aangesloten');
    const secret=process.env.BPD_FIVEM_EVIDENCE_SECRET;
    if(!hasTelemetryKey(secret))return err(res,503,'Telemetrieconfiguratie ontbreekt');
    const supplied=bearerToken(req.get('Authorization'));
    if(!safeCompare(supplied,secret))return err(res,401,'Ongeldige serverauthenticatie');
    let evidenceInput;
    try{evidenceInput=validatedTelemetryInput(req.body)}
    catch(e){return err(res,400,e.message)}
    try{
      const {discordId,...values}=evidenceInput;
      const evidence=signTrustedTelemetry(discordId,values,secret);
      const db=getFirestore();
      const evidenceRef=db.collection(EVIDENCE_COLLECTION).doc(discordId);
      // When a trusted FiveM connector eventually starts posting telemetry,
      // create a separate civilian identity dossier only if independently enabled.
      // No police/personnel roles or applicant decisions are assigned here.
      const citizenOn=citizenDossiersEnabled(process.env);
      const citizenRef=citizenOn?db.collection(CITIZEN_COLLECTION).doc(discordId):null;
      await db.runTransaction(async tx=>{
        const existing=citizenRef?await tx.get(citizenRef):null;
        tx.set(evidenceRef,{...evidence,updatedAt:FieldValue.serverTimestamp()});
        if(citizenRef&&!existing.exists){
          tx.create(citizenRef,{
            ...citizenInitialData(discordId,'trusted_fivem_server'),
            createdAt:FieldValue.serverTimestamp(),
            updatedAt:FieldValue.serverTimestamp()
          });
          tx.create(citizenRef.collection('audit').doc(),{
            action:'citizen_registered',origin:'trusted_fivem_server',
            byDiscordId:null,at:FieldValue.serverTimestamp()
          });
        }
      });
      return res.json({saved:true,discordId});
    }catch(e){return friendlyError(res,e)}
  });

  // Every Discord member may inspect only their own application status.
  // No permission to inspect cases or staff personnel is implied.
  app.get('/api/service-applications/me',async(req,res)=>{
    if(!enabled())return err(res,503,'Sollicitaties zijn nog niet geopend');
    try{
      const applicant=await applicantIdentity(req),db=getFirestore();
      const [evidence,...docs]=await Promise.all([
        db.collection(EVIDENCE_COLLECTION).doc(applicant.discordId).get(),
        ...APPLICATION_SERVICES.map(dept=>db.collection(SERVICE_APPLICATIONS_COLLECTION)
          .doc(serviceApplicantDossierId(dept,applicant.discordId)).get())
      ]);
      const eligibility=verifySignedTelemetry(applicant.discordId,evidence.data(),
        process.env.BPD_FIVEM_EVIDENCE_SECRET);
      return res.json({identity:{username:applicant.username},
        eligibility,applications:docs.filter(d=>d.exists)
          .map(d=>publicDossier(d.data(),d.id))});
    }catch(e){return friendlyError(res,e)}
  });

  // Submission is conditional on trusted server-signed evidence, rechecked
  // inside the same transaction that creates the application.
  app.post('/api/service-applications/submit',async(req,res)=>{
    if(!enabled())return err(res,503,'Sollicitaties zijn nog niet geopend');
    let details;
    try{details=validateServiceApplicationDraft(req.body)}
    catch(e){return err(res,400,e.message)}
    try{
      const applicant=await applicantIdentity(req),db=getFirestore();
      const id=serviceApplicantDossierId(details.dept,applicant.discordId);
      const dossier=db.collection(SERVICE_APPLICATIONS_COLLECTION).doc(id);
      const evidence=db.collection(EVIDENCE_COLLECTION).doc(applicant.discordId);
      const timestamp=Date.now();
      await db.runTransaction(async tx=>{
        const [existing,proof]=await Promise.all([tx.get(dossier),tx.get(evidence)]);
        if(existing.exists)throw fail(409,'Voor deze hulpdienst bestaat al een sollicitatiedossier');
        const eligibility=verifySignedTelemetry(applicant.discordId,proof.data(),
          process.env.BPD_FIVEM_EVIDENCE_SECRET,timestamp);
        if(!eligibility.eligible)
          throw fail(403,eligibility.status==='verification_required'
            ?'Speeluren en serverstart zijn nog niet betrouwbaar geverifieerd'
            :'Je voldoet nog niet aan minstens 10 speeluren én 5 dagen op de server');
        tx.create(dossier,{dept:details.dept,discordId:applicant.discordId,
          username:applicant.username,motivation:details.motivation,
          status:'submitted',
          eligibleAt:new Date(timestamp).toISOString(),
          eligibilityProofVerifiedAt:proof.data().verifiedAt,
          createdAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp()});
        tx.create(dossier.collection('audit').doc(),{
          action:'submitted',byDiscordId:applicant.discordId,
          reason:'Sollicitatie ingediend met geverifieerde geschiktheid',
          at:FieldValue.serverTimestamp()
        });
      });
      return res.status(201).json({created:true,id,dept:details.dept,status:'submitted'});
    }catch(e){return friendlyError(res,e)}
  });

  // Reviewer access is restricted by department, independent of applicant
  // Discord role, name or any self-declared service preference.
  app.get('/api/service-applications/review',requireUser,async(req,res)=>{
    if(!enabled())return err(res,503,'Sollicitaties zijn nog niet geopend');
    const dept=String(req.query.dept||'');
    if(!APPLICATION_SERVICES.includes(dept))return err(res,400,'Ongeldige hulpdienst');
    if(!canCreatePersonnel(req.bpd,dept))return err(res,403,'Geen beoordelingsrechten voor deze hulpdienst');
    try{
      const snap=await getFirestore().collection(SERVICE_APPLICATIONS_COLLECTION)
        .where('dept','==',dept).limit(101).get();
      if(snap.size>100)return err(res,409,'Te veel dossiers: gepagineerd overzicht nodig');
      const applications=snap.docs.map(d=>({
        ...publicDossier(d.data(),d.id),
        discordId:d.data().discordId,username:d.data().username
      })).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      return res.json({dept,applications});
    }catch(e){return friendlyError(res,e)}
  });

  app.post('/api/service-applications/:dept/:discordId/decision',requireUser,async(req,res)=>{
    if(!enabled())return err(res,503,'Sollicitaties zijn nog niet geopend');
    const {dept,discordId}=req.params;
    if(!APPLICATION_SERVICES.includes(dept)||!/^\d{15,22}$/.test(discordId))
      return err(res,400,'Ongeldige sollicitatie');
    if(!canCreatePersonnel(req.bpd,dept)||req.bpd.discordId===discordId)
      return err(res,403,'Geen bevoegdheid om deze sollicitatie te beoordelen');
    const decision=req.body?.decision;
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(!['reviewing','accepted','rejected'].includes(decision)||
       reason.length<15||reason.length>500)
      return err(res,400,'Kies een beslissing en motiveer die met 15 tot 500 tekens');
    try{
      const ref=getFirestore().collection(SERVICE_APPLICATIONS_COLLECTION)
        .doc(serviceApplicantDossierId(dept,discordId));
      await getFirestore().runTransaction(async tx=>{
        const found=await tx.get(ref);
        if(!found.exists)throw fail(404,'Sollicitatie niet gevonden');
        const old=found.data().status;
        if(!((old==='submitted'&&['reviewing','rejected'].includes(decision))||
             (old==='reviewing'&&['accepted','rejected'].includes(decision))))
          throw fail(409,'Deze beslissing is niet toegelaten vanuit de huidige status');
        tx.update(ref,{status:decision,updatedAt:FieldValue.serverTimestamp(),
          decisionReason:reason,decidedAt:FieldValue.serverTimestamp(),
          decidedByDiscordId:req.bpd.discordId||null});
        tx.create(ref.collection('audit').doc(),{
          action:decision,previousStatus:old,newStatus:decision,
          byUid:req.bpd.uid,byDiscordId:req.bpd.discordId||null,
          reason,at:FieldValue.serverTimestamp()
        });
      });
      // A positive decision NEVER creates a personnel dossier or rights.
      return res.json({updated:true,status:decision,
        personnelCreated:false,rolesGranted:false});
    }catch(e){return friendlyError(res,e)}
  });
}
