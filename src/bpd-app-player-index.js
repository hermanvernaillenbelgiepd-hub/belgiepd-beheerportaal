// Read-only BelgiumPD app roster of accumulated FiveM playtime.
// Never use these totals as completed calendar-month hours or as ping proof.
import {bpdAppApiConfigured,normalizedServerPlayer} from './bpd-app-hours.js';
const URL_BASE='https://app.belgiepd.be/api/v1/server-players';
const MAX_PAGES=80,MAX_ITEMS=8000,MAX_PAGE_BYTES=512*1024;
let last=null,expires=0,pending=null;
export function appActivityPrimaryEnabled(env=process.env){
 return env.BPD_ACTIVITY_API_PRIMARY==='true'&&bpdAppApiConfigured(env);
}
async function readPages({env,fetchImpl,now}){
 const token=env.BPD_APP_API_BEARER_TOKEN.trim();
 const players=new Map(),ambiguous=new Set();
 let lastPage=null;
 for(let page=1;page<=(lastPage||MAX_PAGES);page++){
  // Build only our own known endpoint and numeric page. Never follow upstream links.
  const url=URL_BASE+(page===1?'':'?page='+page);
  const res=await fetchImpl(url,{method:'GET',redirect:'error',
   headers:{Accept:'application/json',Authorization:'Bearer '+token},
   signal:AbortSignal.timeout(7000)});
  if(!res.ok)return {status:res.status===401?'unauthorized':'unavailable'};
  if(Number(res.headers?.get?.('content-length'))>MAX_PAGE_BYTES)
   return {status:'invalid_response'};
  const raw=await res.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_PAGE_BYTES)return {status:'invalid_response'};
  let data;
  try{data=JSON.parse(raw)}catch{return {status:'invalid_response'}}
  if(!Array.isArray(data?.data)||!data.meta||typeof data.meta!=='object')
   return {status:'invalid_response'};
  const current=data.meta.current_page,count=data.meta.last_page;
  if(!Number.isSafeInteger(current)||current!==page||
    !Number.isSafeInteger(count)||count<page||count>MAX_PAGES||
    (lastPage!==null&&count!==lastPage)||
    data.data.length>MAX_ITEMS)return {status:'invalid_response'};
  lastPage=count;
  for(const row of data.data){
   const id=row?.discord_id;
   if(id===null||id===undefined)continue; // some players are not linked to Discord
   if(typeof id!=='string'||!/^\\d{17,20}$/.test(id))
    return {status:'invalid_response'}; // never round numeric Discord snowflakes
   const player=normalizedServerPlayer(row,id);
   if(!player)return {status:'invalid_response'};
   if(players.has(id)){players.delete(id);ambiguous.add(id)}
   else if(!ambiguous.has(id))players.set(id,player);
   if(players.size+ambiguous.size>MAX_ITEMS)return {status:'invalid_response'};
  }
 }
 return {status:'ok',players,ambiguousCount:ambiguous.size,
  fetchedAt:new Date(now).toISOString(),pageCount:lastPage};
}
export async function fetchAppActivityIndex({env=process.env,fetchImpl=fetch,
 now=Date.now()}={}){
 if(env.BPD_ACTIVITY_API_PRIMARY!=='true')return {status:'disabled'};
 if(!bpdAppApiConfigured(env))return {status:'not_configured'};
 try{return await readPages({env,fetchImpl,now})}
 catch{return {status:'unavailable'}}
}
// Prevent every staff dashboard refresh from contacting the upstream API.
// Failure is not cached: authorised users may immediately retry.
export async function loadAppActivityIndex({env=process.env}={}){
 if(env.BPD_ACTIVITY_API_PRIMARY!=='true')return {status:'disabled'};
 if(!bpdAppApiConfigured(env))return {status:'not_configured'};
 if(last?.status==='ok'&&expires>Date.now())return last;
 if(pending)return pending;
 pending=fetchAppActivityIndex({env}).then(answer=>{
  if(answer.status==='ok'){last=answer;expires=Date.now()+120_000}
  return answer;
 }).finally(()=>{pending=null});
 return pending;
}
