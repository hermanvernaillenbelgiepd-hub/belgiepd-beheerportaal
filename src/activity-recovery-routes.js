// Staff-authorised, explicit API sampler. Writes ONLY evidence observations.
// It NEVER changes official status, creates pings or signs off an ACTIEF proposal.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canViewPersonnel,canReadPersonnelSubject,validPersonnelKey}
 from './personnel-editor-policy.js';
import {readPersonalBpdAppHours} from './bpd-app-hours.js';
import {RECOVERY_SAMPLES_COLLECTION,recoveryStatus,
 recoverySampleProjection,appendRecoveryApiSample} from './activity-recovery-policy.js';
const depts=new Set(['politie','brandweer','ambulance','depannage']);
export function installActivityRecoveryRoutes(app,{
 requireUser,getSnapshot,readPlayer=readPersonalBpdAppHours,
 dbFactory=getFirestore,now=()=>new Date()
}){
 async function subject(req,res){
  const {dept,discordId}=req.params;
  if(!depts.has(dept)||!validPersonnelKey(dept,discordId)){
   res.status(400).json({error:'Ongeldige dienst of Discord-ID'});return null;
  }
  if(!canViewPersonnel(req.bpd,dept)){
   res.status(403).json({error:'Geen inzagebevoegdheid voor deze dienst'});return null;
  }
  const snapshot=await getSnapshot();
  if(snapshot?.stale||!Array.isArray(snapshot?.data)){
   res.status(503).json({error:'Actuele personeelsbron niet beschikbaar'});return null;
  }
  const found=snapshot.data.filter(p=>p.dept===dept&&p.personId===discordId&&
    !['archived','pending'].includes(p.lifecycleState));
  if(found.length!==1){
   res.status(found.length?409:404).json({error:'Geen uniek actief personeelsdossier'});return null;
  }
  if(!canReadPersonnelSubject(req.bpd,found[0])){
   res.status(403).json({error:'Personeelsdossier afgeschermd'});return null;
  }
  return {person:found[0],status:recoveryStatus(found[0].status,
   found[0].leaveReturnChecking===true)};
 }
 const ref=(db,req)=>db.collection(RECOVERY_SAMPLES_COLLECTION)
  .doc(req.params.dept+'_'+req.params.discordId);
 app.get('/api/activity-recovery/:dept/:discordId',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try{
   const auth=await subject(req,res);if(!auth)return;
   const stored=await ref(dbFactory(),req).get();
   return res.json(recoverySampleProjection(stored.data(),auth.status,now()));
  }catch{return res.status(503).json({error:'Herstelmeting niet beschikbaar'})}
 });
 app.post('/api/activity-recovery/:dept/:discordId/observe',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try{
   const auth=await subject(req,res);if(!auth)return;
   if(!auth.status)return res.status(409).json({
    error:'Alleen 50/50, INACTIEF of CHECKING kan een herstelmeting starten'});
   // Read the already configured BPD API; do not trust any browser-supplied minutes.
   const result=await readPlayer(req.params.discordId);
   if(result?.status!=='verified_api'||!Number.isSafeInteger(result.playTimeMinutes)||
     result.playTimeMinutes<0)
    return res.status(503).json({error:'Geen bruikbare FiveM-API-meting; niets gewijzigd'});
   const at=now(),sample={observedAt:at.toISOString(),
    totalPlayMinutes:result.playTimeMinutes,
    lastConnectionAt:result.lastConnectionAt||null};
   const db=dbFactory(),document=ref(db,req);
   const saved=await db.runTransaction(async tx=>{
    const current=await tx.get(document);
    const next=appendRecoveryApiSample(current.data(),auth.status,sample,at);
    if(next.changed)tx.set(document,{
     dept:req.params.dept,discordId:req.params.discordId,
     trackingStatus:next.trackingStatus,samples:next.samples,
     source:'bpd-server-player-cumulative',
     updatedAt:FieldValue.serverTimestamp()});
    return {changed:next.changed,...recoverySampleProjection(next,auth.status,at)};
   });
   return res.json({...saved,readOnlyPersonnel:true,noAutomaticPings:true});
  }catch{return res.status(503).json({error:'Herstelcontrole niet verwerkt; bestaande gegevens blijven behouden'})}
 });
}
