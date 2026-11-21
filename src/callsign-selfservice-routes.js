import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {verifiedDiscordIdentity} from './user-access.js';
import {checkApplicant} from './callsign-utils.js';
import {botTelemetryReady} from './callsign-bot-telemetry.js';

const idPattern=/^\d{15,22}$/;
const PROOF_MAX_AGE=24*60*60*1000;
function apiError(res,error){
  console.error('Eigen vaste roepnummeraanvraag:',error?.code||error?.message||'onbekend');
  res.status(503).json({error:'Je aanvraag kon momenteel niet worden verwerkt'});
}
export function recentVerifiedProof(value,id,now=Date.now()){
  const ms=Date.parse(value?.checkedAt||'');
  return value?.discordId===id &&
    value?.source==='fivem-bot-en-discord-api' &&
    value?.eligible===true &&value?.hasFiveDays===true&&value?.hasTenHours===true&&
    Number.isFinite(ms)&&ms<=now+60000&&now-ms<=PROOF_MAX_AGE;
}
export function installCallsignSelfServiceRoutes(app,{getSnapshot}){
  const db=()=>getFirestore();
  async function ownDiscord(req,res,next){
    const token=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
    if(!token)return res.status(401).json({error:'Meld je aan met je eigen Discord-account'});
    try{
      if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
      const decoded=await getAuth().verifyIdToken(token);
      const id=typeof decoded.uid==='string'&&decoded.uid.startsWith('discord:')?
        decoded.uid.slice('discord:'.length):'';
      if(!idPattern.test(id))return res.status(403).json({error:'Een geverifieerd Discord-account is vereist'});
      const [member,managed]=await Promise.all([
        db().collection('bpd_discord_auth').doc(id).get(),
        db().collection('bpd_portal_users').doc(id).get()
      ]);
      if(!verifiedDiscordIdentity(decoded,member.data(),process.env.DISCORD_GUILD_ID,Date.now(),15*60000))
        return res.status(403).json({error:'Vernieuw eerst je Discord-verificatie'});
      if(managed.get('status')==='blocked')
        return res.status(403).json({error:'Je portaaltoegang is geblokkeerd'});
      req.selfCallsign={id,member:member.data()};
      next();
    }catch(error){apiError(res,error)}
  }
  app.get('/api/callsigns/self/status',ownDiscord,async(req,res)=>{
    const id=req.selfCallsign.id;
    try{
      const [proof,request,lifecycle]=await Promise.all([
        db().collection('bpd_callsign_eligibility_proofs').doc(id).get(),
        db().collection('bpd_callsign_requests').doc(id).get(),
        db().collection('bpd_personnel_lifecycle').doc('politie_'+id).get()
      ]);
      const evidence=proof.data();
      res.set('Cache-Control','private, no-store');
      res.json({
        applicant:id,
        request:request.exists?{
          status:request.get('status'),temporaryCall:request.get('temporaryCall'),
          assignedCall:request.get('assignedCall')||null}:null,
        eligible:recentVerifiedProof(evidence,id)&&
          !['archived','pending'].includes(lifecycle.get('state')),
        reentryRequired:['archived','pending'].includes(lifecycle.get('state')),
        hasFiveDays:evidence?.hasFiveDays===true,
        hasTenHours:evidence?.hasTenHours===true,
        playHours:Number.isFinite(evidence?.playHours)?Math.floor(evidence.playHours*100)/100:null,
        joinedOn:evidence?.joinedOn||null,
        checkedAt:evidence?.checkedAt||null,
        botAvailable:botTelemetryReady(process.env),
        requestsEnabled:process.env.BPD_ENABLE_CALLSIGN_REQUESTS==='true'
      });
    }catch(error){apiError(res,error)}
  });
  app.post('/api/callsigns/self/request',ownDiscord,async(req,res)=>{
    if(process.env.BPD_ENABLE_CALLSIGN_REQUESTS!=='true')
      return res.status(503).json({error:'Vaste roepnummeraanvragen staan nog uit'});
    const id=req.selfCallsign.id;
    const raw=req.body||{};
    if(Object.keys(raw).some(k=>!['name','temporaryCall'].includes(k)))
      return res.status(400).json({error:'Onbekende aanvraagvelden'});
    let data;
    try{data=checkApplicant({name:raw.name,temporaryCall:raw.temporaryCall,discordId:id},{allowMissingTemporary:true})}
    catch(error){return res.status(400).json({error:error.message})}
    try{
      const snap=await getSnapshot({includeArchived:true});
      if(snap.stale)return res.status(503).json({error:'Personeelslijst is tijdelijk niet actueel'});
      const archived=snap.data.filter(p=>p.dept==='politie'&&p.personId===id&&
        ['archived','pending'].includes(p.lifecycleState));
      const possiblePrior=snap.data.filter(p=>p.dept==='politie'&&p.personId!==id&&
        ['archived','pending'].includes(p.lifecycleState)&&
        String(p.name||'').trim().toLocaleLowerCase('nl-BE')===
          data.name.toLocaleLowerCase('nl-BE'));
      if(archived.length||possiblePrior.length){
        // An applicant's name is not proof of identity. Only flag to the cadre.
        const proof=await db().collection('bpd_callsign_eligibility_proofs').doc(id).get();
        if(archived.length||recentVerifiedProof(proof.data(),id)){
          await db().collection('bpd_personnel_reentry_alerts').doc(id).set({
            discordId:id,name:archived[0]?.name||data.name,
            kind:archived.length?'archived_callsign_attempt':'possible_identity_transfer',
            status:'pending',updatedAt:FieldValue.serverTimestamp()
          },{merge:true});
        }
        return res.status(409).json({error:archived.length?
          'Je oude politiedossier is gearchiveerd. Vraag herintreding aan bij Officierenkader of Korpsleiding.':
          'Mogelijk eerder personeelsdossier. Laat Officierenkader je identiteit controleren.'});
      }
      const currentPolice=snap.data.filter(p=>p.dept==='politie'&&p.personId===id);
      if(currentPolice.length>1)
        return res.status(409).json({error:'Meerdere politieregistraties gevonden; laat Officierenkader je dossier controleren'});
      if(currentPolice.length===1){
        const existing=currentPolice[0],rawCall=String(existing.call||'').trim();
        // An existing temporary 101–199 recruit should still be able to
        // request a permanent 200-series callsign for the SAME Discord ID.
        if(!/^1\d{2}$/.test(rawCall)||Number(rawCall)<101||
           String(existing.name||'').trim().toLocaleLowerCase('nl-BE')!==
             data.name.toLocaleLowerCase('nl-BE'))
          return res.status(409).json({error:
            'Je politieregistratie heeft al een vast roepnummer of wijkt af. Contacteer Officierenkader.'});
        if(data.temporaryCall&&data.temporaryCall!==rawCall)
          return res.status(409).json({error:'Je tijdelijk roepnummer komt niet overeen met je personeelsregistratie'});
        data.temporaryCall=rawCall;
      }
      if(data.temporaryCall&&snap.data.some(p=>p.dept==='politie'&&String(p.call||'')===data.temporaryCall&&p.personId!==id))
        return res.status(409).json({error:'Dit tijdelijke roepnummer wordt al gebruikt. Kies een ander nummer'});
      if(data.temporaryCall){
        const existing=await db().collection('bpd_callsign_requests')
          .where('temporaryCall','==',data.temporaryCall).get();
        if(existing.docs.some(doc=>doc.id!==id&&
          !['rejected'].includes(doc.get('status'))))
          return res.status(409).json({error:'Dit tijdelijke roepnummer is al gereserveerd of aangevraagd'});
      }
      const reqRef=db().collection('bpd_callsign_requests').doc(id);
      const proofRef=db().collection('bpd_callsign_eligibility_proofs').doc(id);
      const callRef=data.temporaryCall?db().collection('bpd_temporary_call_reservations').doc(data.temporaryCall):null;
      await db().runTransaction(async tx=>{
        const [request,proof,call]=await Promise.all([
          tx.get(reqRef),tx.get(proofRef),callRef?tx.get(callRef):Promise.resolve(null)
        ]);
        if(request.exists)throw Object.assign(Error('Je hebt al een aanvraag of vast roepnummer'),{status:409});
        if(!recentVerifiedProof(proof.data(),id))
          throw Object.assign(Error('Eerst 5 dagen én 10 speeluren via de bot laten bevestigen'),{status:403});
        if(call?.exists&&call.get('discordId')!==id)
          throw Object.assign(Error('Dit tijdelijke roepnummer is al gereserveerd'),{status:409});
        const at=FieldValue.serverTimestamp();
        if(callRef&&!call.exists)tx.create(callRef,{discordId:id,createdAt:at,source:'selfservice'});
        tx.create(reqRef,{...data,status:'verified',
          verification:{...proof.data(),source:'fivem-bot-en-discord-api'},
          submittedBy:{discordId:id,name:data.name,call:data.temporaryCall},
          submittedUid:'discord:'+id,submittedVia:'selfservice',
          createdAt:at,updatedAt:at});
      });
      return res.status(201).json({created:true,status:'verified',
        temporaryCall:data.temporaryCall,message:'Aanvraag ingediend. Hogere leiding beslist over toekenning van een vrij nummer uit de 200-reeks.'});
    }catch(error){
      if(error?.status)return res.status(error.status).json({error:error.message});
      apiError(res,error);
    }
  });
}
