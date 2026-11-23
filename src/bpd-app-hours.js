// BelgiumPD app API read-only adapter. No browser credentials, no role writes.
// Endpoint definitions are grounded in belgiëpd.json v0.0.1, except duty-times:
// its schema is undocumented so it is deliberately NEVER interpreted as hours.
const HOST='https://app.belgiepd.be/api';
const ID=/^\d{17,20}$/;
const MAX_BYTES=32*1024;
const LIMIT_MS=6500;
const date=value=>{
 if(typeof value!=='string'||value.length>48)return null;
 const stamp=Date.parse(value);
 return Number.isFinite(stamp)?new Date(stamp).toISOString():null;
};
export function bpdAppApiConfigured(env=process.env){
 return env.BPD_ENABLE_BPD_APP_HOURS==='true'&&
  typeof env.BPD_APP_API_BEARER_TOKEN==='string'&&
  env.BPD_APP_API_BEARER_TOKEN.trim().length>0;
}
export function fivemEligibility(player,now=new Date()){
 const total=player?.playTimeMinutes;
 const first=Date.parse(player?.firstConnectionAt||'');
 const validHours=Number.isSafeInteger(total)&&total>=0;
 const validFirst=Number.isFinite(first)&&first<=now.getTime();
 const elapsed=validFirst?Math.max(0,now.getTime()-first):null;
 return {
  minimumHours:10,minimumDays:5,
  playHoursMet:validHours?total>=600:null,
  fiveDaysMet:validFirst?elapsed>=5*86400000:null,
  eligible:validHours&&validFirst?total>=600&&elapsed>=5*86400000:null,
  // Read-only indication, never sufficient authority for application writes.
  informationalOnly:true
 };
}
export function normalizedServerPlayer(payload,discordId){
 if(!ID.test(String(discordId||'')))return null;
 const candidate=payload?.data&&typeof payload.data==='object'&&!Array.isArray(payload.data)
  ?payload.data:payload;
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return null;
 const upstreamId=candidate.discord_id;
 if(upstreamId!==null&&upstreamId!==undefined&&upstreamId!==discordId)return null;
 const minutes=candidate.play_time_minutes;
 if(!Number.isSafeInteger(minutes)||minutes<0||minutes>1e9)return null;
 return {
  playTimeMinutes:minutes,
  playHours:Math.round(minutes/60*100)/100,
  firstConnectionAt:date(candidate.first_connection_at),
  lastConnectionAt:date(candidate.last_connection_at),
  source:'bpd-app-server-player'
 };
}
async function onlyFixedEndpoint(route,env,fetchImpl){
 const token=env.BPD_APP_API_BEARER_TOKEN.trim();
 const url=HOST+route;
 const response=await fetchImpl(url,{
  method:'GET',
  headers:{Accept:'application/json',Authorization:'Bearer '+token},
  redirect:'error',signal:AbortSignal.timeout(LIMIT_MS)
 });
 if(!response.ok)return {status:response.status===401?'unauthorized':'upstream_unavailable'};
 if(Number(response.headers?.get?.('content-length'))>MAX_BYTES)
  return {status:'invalid_response'};
 const body=await response.text();
 if(Buffer.byteLength(body,'utf8')>MAX_BYTES)return {status:'invalid_response'};
 try{return {status:'ok',data:JSON.parse(body)}}catch{return {status:'invalid_response'}}
}
export async function readPersonalBpdAppHours(discordId,{
 env=process.env,fetchImpl=fetch,now=new Date()
}={}){
 if(!ID.test(String(discordId||'')))return {status:'invalid_identity'};
 if(!bpdAppApiConfigured(env))return {status:'not_configured'};
 try{
  const {status,data}=await onlyFixedEndpoint('/v1/server-players/'+discordId,env,fetchImpl);
  if(status!=='ok')return {status};
  const player=normalizedServerPlayer(data,discordId);
  if(!player)return {status:'invalid_response'};
  return {status:'verified_api',...player,
   retrievedAt:now.toISOString(),solicitation:fivemEligibility(player,now)};
 }catch{return {status:'upstream_unavailable'}}
}
// The caller receives ONLY structural metadata; never raw duty-time records,
// credentials, IDs or guessed hours. Extend after the duty-times schema is supplied.
export async function inspectOwnDutyTimesShape(discordId,{
 env=process.env,fetchImpl=fetch
}={}){
 if(!ID.test(String(discordId||'')))return {status:'invalid_identity'};
 if(!bpdAppApiConfigured(env))return {status:'not_configured'};
 try{
  const {status,data}=await onlyFixedEndpoint('/v1/duty-times/'+discordId,env,fetchImpl);
  if(status!=='ok')return {status};
  const records=Array.isArray(data)?data:
   Array.isArray(data?.data)?data.data:
   Array.isArray(data?.records)?data.records:null;
  return {status:'schema_unverified',format:Array.isArray(data)?'array':
   data===null?'null':typeof data,
   hasCollection:records!==null,
   // A zero-count list is not evidence of zero logged duty hours.
   hasRecords:records===null?null:records.length>0};
 }catch{return {status:'upstream_unavailable'}}
}
