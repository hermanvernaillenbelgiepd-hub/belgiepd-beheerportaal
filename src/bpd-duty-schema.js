// BelgiumPD duty-times schema inspection: only field names/types, never record values.
// Used exclusively by the verified Technical Beheer in TEST to confirm unknown API shape.
import {bpdAppApiConfigured} from './bpd-app-hours.js';
const ROOT='https://app.belgiepd.be/api/v1/duty-times';
const ID=/^\d{15,22}$/,KEY=/^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const MAX_BYTES=96*1024;
const type=x=>x===null?'null':Array.isArray(x)?'array':
 typeof x==='object'?'object':['string','number','boolean'].includes(typeof x)?typeof x:'other';
const fields=x=>x&&typeof x==='object'&&!Array.isArray(x)?
 Object.keys(x).filter(k=>KEY.test(k)).slice(0,32).map(k=>({field:k,type:type(x[k])})):[];
function firstRecord(value){
 for(let i=0;i<4;i++){
  if(Array.isArray(value))return value.find(x=>x&&typeof x==='object'&&!Array.isArray(x))||null;
  if(!value||typeof value!=='object')return null;
  const key=['data','records','items','duty_times','duties','shifts','entries','results']
    .find(k=>Array.isArray(value[k])||(value[k]&&typeof value[k]==='object'));
  if(!key)return null;
  value=value[key];
 }
 return null;
}
export function safeDutyStructure(data){
 const record=firstRecord(data);
 return {rootType:type(data),rootFields:fields(data),
   recordType:type(record),recordFields:fields(record)};
}
export async function inspectDutySchema(scope,discordId,{env=process.env,fetchImpl=fetch}={}){
 if(!['self','all'].includes(scope))return {status:'invalid_scope'};
 if(scope==='self'&&!ID.test(String(discordId||'')))return {status:'invalid_identity'};
 if(!bpdAppApiConfigured(env))return {status:'not_configured'};
 try{
  const res=await fetchImpl(ROOT+(scope==='self'?'/'+discordId:''),{
   method:'GET',redirect:'error',headers:{
     Accept:'application/json',
     Authorization:'Bearer '+env.BPD_APP_API_BEARER_TOKEN.trim()
   },signal:AbortSignal.timeout(7000)
  });
  if(!res.ok)return {status:res.status===401?'unauthorized':
    res.status===403?'forbidden':'upstream_unavailable'};
  if(Number(res.headers?.get?.('content-length'))>MAX_BYTES)
   return {status:'response_too_large'};
  const raw=await res.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_BYTES)return {status:'response_too_large'};
  let json;
  try{json=JSON.parse(raw)}catch{return {status:'invalid_response'}}
  return {status:'schema_unverified',...safeDutyStructure(json)};
 }catch{return {status:'upstream_unavailable'}}
}
