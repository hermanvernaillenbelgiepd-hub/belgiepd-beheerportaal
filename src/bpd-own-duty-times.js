// Alleen-lezen persoonlijke diensturen via de BelgiëPD API.
// Verifieer exacte Discord-identiteit; registreer geen uren of personeelsstatus.
// Maandelijkse activiteit wordt NIET uit dit cumulatieve antwoord afgeleid.
import {bpdAppApiConfigured} from './bpd-app-hours.js';

const ROOT='https://app.belgiepd.be/api/v1/duty-times/';
const ID=/^\d{15,22}$/;
const MAX_BODY_BYTES=512*1024;
const MAX_SHIFTS=1000;
const MAX_MINUTES=100000000;
const textField=(value,max=72)=>typeof value==='string'&&
 value.length<=max&&value.trim()?value.trim():null;
const timeField=value=>{
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||value.length>48)return null;
 const ms=Date.parse(value);
 return Number.isFinite(ms)?new Date(ms).toISOString():null;
};
const minutesField=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX_MINUTES?n:null;
function normalizeShift(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const minutes=minutesField(input.minutes),service=textField(input.service),
  department=textField(input.department);
 if(minutes===null||(!service&&!department)||
   typeof input.is_ongoing!=='boolean')return null;
 const startedAt=timeField(input.started_at);
 const endedAt=timeField(input.ended_at);
 if(!startedAt||(!input.is_ongoing&&!endedAt))return null;
 if(endedAt&&Date.parse(endedAt)<Date.parse(startedAt))return null;
 return {service,department,minutes,startedAt,endedAt,
  ongoing:input.is_ongoing};
}
export function normalizePersonalDutyTimes(payload,id,now=new Date()){
 if(!ID.test(String(id||''))||!payload||typeof payload!=='object'||
    Array.isArray(payload)||payload.discord_id!==id||!Array.isArray(payload.shifts)||
    payload.shifts.length>MAX_SHIFTS)return null;
 const reportedMinutes=minutesField(payload.minutes);
 if(reportedMinutes===null)return null;
 const shifts=payload.shifts.map(normalizeShift);
 if(shifts.some(x=>x===null))return null;
 const total=shifts.reduce((sum,x)=>sum+x.minutes,0);
 if(!Number.isSafeInteger(total)||total>MAX_MINUTES)return null;
 const groups=new Map();
 for(const shift of shifts){
  const key=JSON.stringify([shift.department,shift.service]);
  const g=groups.get(key)||{department:shift.department,service:shift.service,
    minutes:0,count:0,ongoing:0};
  g.minutes+=shift.minutes;g.count++;
  if(shift.ongoing)g.ongoing++;
  groups.set(key,g);
 }
 const byService=[...groups.values()].sort((a,b)=>b.minutes-a.minutes||
   String(a.department).localeCompare(String(b.department)));
 return {status:'verified_api',source:'bpd-duty-times',
   reportedMinutes,shiftMinutes:total,reconciled:reportedMinutes===total,
   period:{from:timeField(payload.from),till:timeField(payload.till)},
   ongoingShifts:shifts.filter(s=>s.ongoing).length,
   byService,shifts:shifts.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)),
   retrievedAt:now.toISOString(),monthlyHoursVerified:false};
}
export async function readOwnDutyTimes(id,{env=process.env,fetchImpl=fetch,now=new Date()}={}){
 if(!ID.test(String(id||'')))return {status:'invalid_identity'};
 if(!bpdAppApiConfigured(env))return {status:'not_configured'};
 try{
  const response=await fetchImpl(ROOT+id,{
   method:'GET',redirect:'error',
   headers:{Accept:'application/json',
     Authorization:'Bearer '+env.BPD_APP_API_BEARER_TOKEN.trim()},
   signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)return {status:response.status===401?'unauthorized':
    response.status===403?'forbidden':'upstream_unavailable'};
  const size=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(size)&&size>MAX_BODY_BYTES)return {status:'response_too_large'};
  const raw=await response.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)return {status:'response_too_large'};
  let payload;
  try{payload=JSON.parse(raw)}catch{return {status:'invalid_response'}}
  const item=normalizePersonalDutyTimes(payload,id,now);
  return item||{status:'invalid_response'};
 }catch{return {status:'upstream_unavailable'}}
}
export function installOwnDutyTimesRoutes(app,{
 requireUser,env=process.env,fetchImpl=fetch,now=()=>new Date()
}){
 app.get('/api/duty-times/me',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const id=String(req.bpd?.discordId||'');
  if(!ID.test(id)||req.bpd?.uid!=='discord:'+id)
   return res.status(403).json({error:'Geverifieerde Discord-identiteit vereist'});
  const result=await readOwnDutyTimes(id,{env,fetchImpl,now:now()});
  if(result.status==='verified_api')return res.json(result);
  const status=result.status==='not_configured'?503:
   ['invalid_response','response_too_large'].includes(result.status)?502:503;
  return res.status(status).json({status:result.status,
   error:'Eigen diensturen momenteel niet beschikbaar. Er worden geen uren geschat.'});
 });
}
