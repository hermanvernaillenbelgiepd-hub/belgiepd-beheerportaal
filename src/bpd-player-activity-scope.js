// Read-only FiveM API lookup for one verified, authorized personnel dossier.
// These API totals are cumulative, NEVER a signed closed-month activity measurement.
import {canViewPersonnel,canReadPersonnelSubject,validPersonnelKey}
 from './personnel-editor-policy.js';
import {readPersonalBpdAppHours} from './bpd-app-hours.js';

const ALLOWED=new Set(['politie','brandweer','ambulance','depannage']);
const minute=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000?value:null;
export function projectBpdPlayerActivity(result){
 if(result?.status!=='verified_api')return null;
 const totalPlayMinutes=minute(result.playTimeMinutes);
 if(totalPlayMinutes===null)return null;
 const maybeDate=value=>typeof value==='string'&&
  Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 return {
  status:'api_response',source:'bpd-app-server-player',
  totalPlayMinutes,lastConnectionAt:maybeDate(result.lastConnectionAt),
  firstConnectionAt:maybeDate(result.firstConnectionAt),
  retrievedAt:maybeDate(result.retrievedAt),
  monthlyHoursVerified:false,
  lastConnectionSignedByBot:false
 };
}
export function installScopedPlayerActivityRoutes(app,{
 requireUser,getSnapshot,readPlayer=readPersonalBpdAppHours
}){
 app.get('/api/fivem-players/dossiers/:dept/:discordId',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const {dept,discordId}=req.params;
  if(!ALLOWED.has(dept)||!validPersonnelKey(dept,discordId))
   return res.status(400).json({error:'Ongeldige dienst of Discord-ID'});
  // No upstream API call before both service and subject authorization succeed.
  if(!canViewPersonnel(req.bpd,dept))
   return res.status(403).json({error:'Geen toegang tot deze hulpdienst'});
  try{
   const snapshot=await getSnapshot();
   if(snapshot?.stale===true||!Array.isArray(snapshot?.data))
    return res.status(503).json({status:'personnel_unavailable'});
   const found=snapshot.data.filter(p=>p?.dept===dept&&p.personId===discordId&&
    p.lifecycleState!=='archived');
   if(found.length!==1)
    return res.status(found.length?409:404).json({status:'personnel_unavailable'});
   if(!canReadPersonnelSubject(req.bpd,found[0]))
    return res.status(403).json({error:'Personeelsdossier afgeschermd'});
   const upstream=await readPlayer(discordId);
   const safe=projectBpdPlayerActivity(upstream);
   if(!safe)return res.status(503).json({
    status:['unauthorized','forbidden','not_configured','invalid_response',
     'invalid_identity','upstream_unavailable'].includes(upstream?.status)?
     upstream.status:'upstream_unavailable'
   });
   return res.json(safe);
  }catch{return res.status(503).json({status:'upstream_unavailable'})}
 });
}
