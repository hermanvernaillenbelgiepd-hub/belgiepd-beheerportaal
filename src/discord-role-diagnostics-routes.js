import {getFirestore} from 'firebase-admin/firestore';
import {PROFILE_COOKIE,technicalCookieIsValid} from './portal-profile-mode.js';
import {collectDiscordDiagnosis,diagnosisAccess} from './discord-role-diagnostics.js';

const MAIN_SERVICE_ID='srv-dbaj7njbc2fs73bjt4fg';
export function discordDiagnosticsMainOnly(env=process.env){
  // The privileged endpoint is opt-in for the canonical MAIN service only.
  // Never enable it on TEST or arbitrary forks, even if copied by mistake.
  // An explicit Render service identity overrides branch/name fallbacks.
  // A fork may have a branch called main, but must never gain this surface.
  if(env.RENDER_SERVICE_ID)return env.RENDER_SERVICE_ID===MAIN_SERVICE_ID;
  return env.RENDER_GIT_BRANCH==='main'&&
    env.RENDER_SERVICE_NAME==='belgiepd-beheerportaal';
}
// The direct HTML request carries only the signed, HttpOnly technical cookie.
// Actual diagnostic data additionally requires a freshly verified Bearer login.
export function discordDiagnosticsPageAllowed(cookieHeader,env=process.env,now=Date.now()){
  if(!discordDiagnosticsMainOnly(env))return false;
  const header=String(cookieHeader||'');
  if(header.length>2048)return false;
  const raw=header.split(';').map(x=>x.trim())
    .find(x=>x.startsWith(PROFILE_COOKIE+'='));
  if(!raw)return false;
  try{
    const token=raw.slice(PROFILE_COOKIE.length+1).split('.');
    if(token.length!==2||token[0].length>512)return false;
    const payload=JSON.parse(Buffer.from(token[0],'base64url').toString('utf8'));
    const id=String(payload?.id||''),uid=String(payload?.uid||'');
    if(!/^\d{15,22}$/.test(id)||uid!=='discord:'+id)return false;
    if(!String(env.BPD_TECHNICAL_ADMIN_DISCORD_IDS||'')
      .split(',').map(x=>x.trim()).includes(id))return false;
    return technicalCookieIsValid(header,uid,id,
      env.BPD_PORTAL_PROFILE_SIGNING_KEY,now);
  }catch{return false}
}
export function installDiscordDiagnosticRoutes(app,{
  requireUser,firestore=()=>getFirestore(),env=process.env,
  collect=collectDiscordDiagnosis,now=Date.now
}={}){
  // Cache only sanitized, per-actor results. Authorization is evaluated on
  // every call before looking at the cache. Do not cache 401/403 responses.
  const cache=new Map(),pending=new Map();
  async function scopedAccess(actor,includeMember=false){
    const access=diagnosisAccess(actor);
    if(!access)return {access:null,member:null};
    if(!includeMember)return {access,member:null};
    const identity=await firestore().collection('bpd_discord_auth')
      .doc(actor.discordId).get();
    return {access,member:identity.exists?identity.data():null};
  }
  // Lightweight access check: no Discord API calls or scan on page load.
  app.get('/api/board/discord-diagnostics/access',requireUser,async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    if(!discordDiagnosticsMainOnly(env))
      return res.status(404).json({error:'Alleen beschikbaar op MAIN'});
    try{
      const {access}=await scopedAccess(req.bpd);
      return res.json({allowed:Boolean(access)});
    }catch{
      return res.status(503).json({error:'Discord-diagnose tijdelijk niet beschikbaar'});
    }
  });
  app.get('/api/board/discord-diagnostics',requireUser,async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    if(!discordDiagnosticsMainOnly(env))
      return res.status(404).json({error:'Alleen beschikbaar op MAIN'});
    const actor=req.bpd,id=actor?.discordId;
    if(actor?.uid!=='discord:'+id||!/^\d{15,22}$/.test(String(id||'')))
      return res.status(403).json({error:'Een geverifieerde Discord-aanmelding als Technisch Beheer is vereist'});
    try{
      if(!diagnosisAccess(actor))return res.status(403).json({
        error:'Schakel eerst jouw geverifieerde Technisch Beheer-profiel in'
      });
      const {member,access}=await scopedAccess(actor,true);
      // Full guild pagination is never triggered by routine page loads.
      // It requires an explicit action from an already authorised read-only user.
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
      console.warn('Discord-rolcontrole:',typeof error?.code==='string'?
        error.code.slice(0,40):'controle niet beschikbaar');
      return res.status(503).json({error:'Discord-diagnose tijdelijk niet beschikbaar'});
    }
  });
}
