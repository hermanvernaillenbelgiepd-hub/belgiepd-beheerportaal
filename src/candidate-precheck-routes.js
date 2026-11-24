// A candidate can check THEIR OWN FiveM API prerequisites, without a
// personnel account. No application submission or privilege grant exists here.
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {verifiedDiscordIdentity,USER_COLLECTION} from './user-access.js';
import {readPersonalBpdAppHours,fivemEligibility} from './bpd-app-hours.js';
import {isDiscordId} from './discord-utils.js';

const VALID_SOURCE=new Set(['not_configured','unauthorized','forbidden',
 'invalid_response','invalid_identity','upstream_unavailable']);
export function candidatePrecheck(result,now=new Date()){
 const common={readOnly:true,applicationsOpen:false,canSubmit:false,
  source:'bpd-app-server-player',verifiedForAdmission:false,
  requiredPlayMinutes:600,requiredServerDays:5};
 if(result?.status!=='verified_api'){
  return {...common,status:'verification_required',apiAvailable:false,
   reason:VALID_SOURCE.has(result?.status)?result.status:'upstream_unavailable',
   playMinutes:null,firstConnectionAt:null,playHoursMet:null,fiveDaysMet:null,
   eligibleByApi:null,checkedAt:null};
 }
 const proof=fivemEligibility(result,now);
 return {...common,status:proof.eligible===true?'api_thresholds_met':
   proof.eligible===false?'not_yet_eligible':'verification_required',
  apiAvailable:true,reason:null,
  playMinutes:proof.playHoursMet===null?null:result.playTimeMinutes,
  firstConnectionAt:proof.fiveDaysMet===null?null:result.firstConnectionAt,
  playHoursMet:proof.playHoursMet,fiveDaysMet:proof.fiveDaysMet,
  eligibleByApi:proof.eligible,checkedAt:now.toISOString()};
}
export function installCandidatePrecheckRoutes(app,{
 verifyToken=token=>getAuth().verifyIdToken(token),
 getMember=id=>getFirestore().collection('bpd_discord_auth').doc(id).get(),
 getAccount=id=>getFirestore().collection(USER_COLLECTION).doc(id).get(),
 readPlayer=readPersonalBpdAppHours,env=process.env,now=()=>new Date()
}={}){
 app.get('/api/sollicitatiecentrum/mijn-voorwaarden',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
  if(!bearer)return res.status(401).json({error:'Meld je eerst aan met je eigen Discord-account'});
  let id;
  try{
   const verified=await verifyToken(bearer);
   const candidate=verified?.uid?.startsWith('discord:')?verified.uid.slice(8):'';
   if(!isDiscordId(candidate))return res.status(403).json({error:'Eigen Discord-login vereist'});
   const [member,account]=await Promise.all([getMember(candidate),getAccount(candidate)]);
   id=verifiedDiscordIdentity(verified,member?.data?.(),env.DISCORD_GUILD_ID,now().getTime());
   if(id!==candidate)
    return res.status(403).json({error:'Discord-lidmaatschap niet recent genoeg geverifieerd'});
   if(account?.data?.()?.status==='blocked')
    return res.status(403).json({error:'Portaalaccount is geblokkeerd'});
  }catch{
   return res.status(401).json({error:'Discord-aanmelding ongeldig of niet verifieerbaar'});
  }
  try{
   const result=await readPlayer(id);
   return res.json(candidatePrecheck(result,now()));
  }catch{
   return res.status(503).json({error:'FiveM-API tijdelijk niet beschikbaar'});
  }
 });
}
