import {getFirestore} from 'firebase-admin/firestore';
import {BOARD_COLLECTION,activeBoardAppointment} from './board-appointment-policy.js';
import {verifyBoardDiscordRole} from './dossier-grants.js';
import {collectDiscordDiagnosis,diagnosisAccess} from './discord-role-diagnostics.js';

const TEST_SERVICE_ID='srv-dbampoqjnfac738b1tsg';
export function discordDiagnosticsTestOnly(env=process.env){
  // Never expose this administrative surface from MAIN, even if mistakenly
  // cherry-picked. Render provides these two internal deployment properties.
  return env.RENDER_SERVICE_ID===TEST_SERVICE_ID||
    (env.RENDER_GIT_BRANCH==='feature/verlofmodule-test'&&
     env.RENDER_SERVICE_NAME==='belgiepd-beheerportaal-TESTSERVER');
}
export function installDiscordDiagnosticRoutes(app,{
  requireUser,firestore=()=>getFirestore(),env=process.env,
  collect=collectDiscordDiagnosis,now=Date.now
}={}){
  // Cache only sanitized, per-actor results. Authorization is evaluated on
  // every call before looking at the cache. Do not cache 401/403 responses.
  const cache=new Map(),pending=new Map();
  app.get('/api/board/discord-diagnostics',requireUser,async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    if(!discordDiagnosticsTestOnly(env))
      return res.status(404).json({error:'Alleen beschikbaar op TEST'});
    const actor=req.bpd,id=actor?.discordId;
    if(actor?.uid!=='discord:'+id||!/^\d{15,22}$/.test(String(id||'')))
      return res.status(403).json({error:'Een eigen geverifieerde Discord-bestuursaanmelding is vereist'});
    try{
      const db=firestore();
      const [identity,appointment]=await Promise.all([
        db.collection('bpd_discord_auth').doc(id).get(),
        db.collection(BOARD_COLLECTION).doc(id).get()
      ]);
      const member=identity.exists?identity.data():null;
      const appointmentData=appointment.exists?appointment.data():null;
      const access=diagnosisAccess(actor,member,appointmentData,
        env.DISCORD_GUILD_ID,verifyBoardDiscordRole,activeBoardAppointment);
      if(!access)return res.status(403).json({
        error:'Alleen geverifieerd Bestuur of formeel aangesteld Bestuur kan deze diagnose bekijken'
      });
      // Full guild pagination is never triggered by routine page loads.
      // It requires an explicit action from an already authorised board user.
      const coverage=req.query?.coverage==='1';
      const at=now(),key=id+':'+(coverage?'coverage':'quick');
      const found=cache.get(key);
      if(found&&at<found.expires&&found.access===access)
        return res.json(found.report);
      let job=pending.get(key);
      if(!job){
        job=collect({env,ownId:id,ownMember:member,accessSource:access,at,
          coverage});
        pending.set(key,job);
      }
      let report;
      try{report=await job}finally{if(pending.get(key)===job)pending.delete(key);}
      if(cache.size>100)cache.clear();
      cache.set(key,{report,access,
        expires:now()+(coverage?10*60*1000:45000)});
      return res.json(report);
    }catch(error){
      // No Firestore raw messages, IDs, bot credentials or HTTP bodies.
      console.warn('Bestuur Discord-diagnose:',typeof error?.code==='string'?
        error.code.slice(0,40):'controle niet beschikbaar');
      return res.status(503).json({error:'Discord-diagnose tijdelijk niet beschikbaar'});
    }
  });
}
