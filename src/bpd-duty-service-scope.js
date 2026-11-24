// Alleen-lezen API per dienst, geen globale uren of maandpings via dossierinzage.
import {validPersonnelKey,canViewPersonnel,canReadPersonnelSubject}
 from './personnel-editor-policy.js';
import {readOwnDutyTimes} from './bpd-own-duty-times.js';
import {previousClosedDutyMonth,closedDutyMonth,projectDutyMonthlyObservation} from './bpd-duty-monthly-preview.js';
const MATCHED=new Set(['politie','brandweer','ambulance','depannage']);
export function projectScopedDutyTimes(result,dept){
 if(!MATCHED.has(dept)||result?.status!=='verified_api'||!Array.isArray(result.shifts))
  return {status:'unavailable'};
 const matched=result.shifts.filter(x=>typeof x.department==='string'&&
  x.department.trim().toLowerCase()===dept);
 if(!matched.length)return {status:!result.shifts.length&&result.reportedMinutes===0?
  'no_records':'unmapped',department:dept,monthlyHoursVerified:false};
 const total=matched.reduce((n,x)=>n+x.minutes,0);
 if(!Number.isSafeInteger(total)||total<0||total>100000000)return {status:'unavailable'};
 const completed=matched.filter(s=>!s.ongoing&&s.endedAt)
  .sort((a,b)=>Date.parse(b.endedAt)-Date.parse(a.endedAt));
 const services=new Map();
 for(const shift of matched){
  const key=shift.service||'Niet opgegeven';
  services.set(key,(services.get(key)||0)+shift.minutes);
 }
 const ordered=[...matched].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
 return {status:'verified_service_shifts',department:dept,source:'bpd-duty-times',
  minutes:total,shiftCount:matched.length,
  ongoingShifts:matched.filter(x=>x.ongoing).length,
  lastCompletedAt:completed[0]?.endedAt||null,lastStartedAt:ordered[0]?.startedAt||null,
  byService:[...services].map(([service,minutes])=>({service,minutes})),
  shifts:ordered.map(x=>({service:x.service||null,minutes:x.minutes,
   startedAt:x.startedAt,endedAt:x.endedAt,ongoing:x.ongoing})),
  retrievedAt:result.retrievedAt||null,monthlyHoursVerified:false};
}
export function installScopedDutyTimesRoutes(app,{requireUser,getSnapshot,readDuty=readOwnDutyTimes,now=()=>new Date()}){
 app.get('/api/duty-times/dossiers/:dept/:discordId',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const {dept,discordId}=req.params;
  const month=req.query.month===undefined?previousClosedDutyMonth(now()):req.query.month;
  if(!closedDutyMonth(month,now()))
   return res.status(400).json({error:'Kies een afgesloten kalendermaand (JJJJ-MM)'});
  if(!validPersonnelKey(dept,discordId))
   return res.status(400).json({error:'Ongeldige personeelsreferentie'});
  if(!canViewPersonnel(req.bpd,dept))
   return res.status(403).json({error:'Geen bevoegdheid voor deze dienst'});
  try{
   const snapshot=await getSnapshot();
   if(snapshot?.stale||!Array.isArray(snapshot?.data))
    return res.status(503).json({error:'Personeelsbron tijdelijk niet controleerbaar'});
   const matches=snapshot.data.filter(p=>p?.dept===dept&&p.personId===discordId);
   if(matches.length!==1)
    return res.status(matches.length?409:404).json({error:'Personeelsdossier niet eenduidig gevonden'});
   if(!canReadPersonnelSubject(req.bpd,matches[0]))
    return res.status(403).json({error:'Dit dossier is afgeschermd'});
   const result=await readDuty(discordId);
   if(result?.status!=='verified_api')
    return res.status(503).json({error:'API-diensturen tijdelijk niet beschikbaar'});
   const scoped=projectScopedDutyTimes(result,dept);
   return res.json({...scoped,
    monthlyPreview:projectDutyMonthlyObservation(result,dept,month)});
  }catch{return res.status(503).json({error:'Diensturencontrole tijdelijk mislukt'})}
 });
}
