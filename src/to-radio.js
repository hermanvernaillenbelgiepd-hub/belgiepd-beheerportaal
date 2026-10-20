import {createHash} from 'node:crypto';
import {TO_CATEGORIES} from './to-board-policy.js';
import {radioMarkedUnavailable,stripRadioNBMarkers,radioMarkedPair} from '../public/to-radio-availability.js';

const ORIGIN='https://api.sonoranradio.com';
const REFRESH_SECONDS=15;
const MAX_BYTES=512*1024;
const MAX_USERS=1000;
const SAFE_FAILURE='De radioverbinding is tijdelijk niet beschikbaar. Probeer het later opnieuw.';
const CONFIGURATION_MESSAGE='Sonoran Radio is nog niet ingesteld op de server.';
const clean=value=>value.replace(/[\x00-\x1f\x7f]/g,' ').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const orderedCategories=[...TO_CATEGORIES].sort((left,right)=>right.length-left.length);
// New Ambulancedienst labels can carry their number with a hyphen, space or
// directly attached (AMB123). Other categories retain their existing grammar.
const numberedMedicalLabels=new Set(['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB']);

// A callsign is an operational label, never proof of a personnel identity.
export function parseSonoranName(value){
  const none={category:null,number:null,displayName:null,importable:false};
  if(typeof value!=='string')return none;
  const name=clean(value);
  const [label,...nameParts]=name.split('|');
  const head=stripRadioNBMarkers(label.trim()).replace(/\*\s*$/,'').trim(),upper=head.toUpperCase();
  const displayName=nameParts.join('|').trim().slice(0,160)||null;
  // Embedded digits belong to the label (e.g. LSRA-DEPA100), not an officer.
  if(TO_CATEGORIES.includes(upper))return {category:upper,number:null,displayName,importable:false};
  const medical=orderedCategories.find(category=>numberedMedicalLabels.has(category)&&
    upper.startsWith(category)&&/^(?:\s*-\s*|\s+)?\d{1,5}$/.test(head.slice(category.length)));
  if(medical){
    const number=head.slice(medical.length).replace(/^\s*-\s*/,'').trim();
    return {category:medical,number,displayName,importable:Number(number)>0};
  }
  const known=orderedCategories.find(category=>upper.startsWith(category)&&/^\s*-\s*/.test(head.slice(category.length)));
  const parts=known?null:/^([A-Za-z][A-Za-z0-9_-]{0,29}?)\s*-\s*(.+)$/.exec(head);
  if(!known&&!parts)return none;
  const category=known||parts[1].trim().toUpperCase();
  const number=known?head.slice(known.length).replace(/^\s*-\s*/,'').trim():parts[2].trim();
  const importable=TO_CATEGORIES.includes(category)&&/^\d{1,5}$/.test(number)&&Number(number)>0;
  return {category,number:number.slice(0,40)||null,displayName,importable};
}
function configuration(env){
  const rawKey=env.SONORAN_RADIO_API_KEY,rawCommunity=env.SONORAN_RADIO_COMMUNITY_ID;
  const key=typeof rawKey==='string'?rawKey.trim():'';
  const communityId=typeof rawCommunity==='string'?rawCommunity.trim():'';
  const configured=Boolean(key&&rawKey.length<=4096&&!/[\x00-\x1f\x7f]/.test(rawKey)&&/^[A-Za-z0-9_-]{1,100}$/.test(communityId));
  return {key,communityId,configured,signature:hash(JSON.stringify([rawKey??null,rawCommunity??null]))};
}
function protect(value,key){return key?value.split(key).join('[afgeschermd]'):value;}
function normalizedUsers(payload,key){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.connectedUsers)||payload.connectedUsers.length>MAX_USERS)
    throw new Error('Invalid radio payload');
  const users=[],identities=new Set();
  for(const row of payload.connectedUsers){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Invalid radio row');
    if(row.identity!=null&&(typeof row.identity!=='string'||row.identity.length>512))throw new Error('Invalid radio identity');
    if(row.name!=null&&(typeof row.name!=='string'||row.name.length>512))throw new Error('Invalid radio name');
    if(row.roomId!=null&&!(typeof row.roomId==='string'&&row.roomId.length<=80)&&!(typeof row.roomId==='number'&&Number.isSafeInteger(row.roomId)&&row.roomId>=0))
      throw new Error('Invalid radio channel');
    const identity=typeof row.identity==='string'?clean(row.identity):'';
    const rawName=typeof row.name==='string'?clean(row.name):'';
    if(!identity&&!rawName)throw new Error('Missing radio identity');
    const channel=row.roomId==null?null:clean(String(row.roomId))||null;
    const stableIdentity=identity?'identity:'+identity:JSON.stringify(['name',rawName,channel]);
    if(identities.has(stableIdentity))continue;
    identities.add(stableIdentity);
    const name=protect(rawName,key),parsed=parseSonoranName(name);
    users.push({id:'radio_'+hash('sonoran-user\0'+stableIdentity).slice(0,32),name:name.slice(0,160)||'Onbekende gebruiker',
      channel:channel===null?null:protect(channel,key).slice(0,80),
      notAvailable:radioMarkedUnavailable(name),paired:radioMarkedPair(name)&&parsed.importable,...parsed});
  }
  const labels=new Map();
  for(const user of users){
    if(!user.importable)continue;
    const label=user.category+'|'+Number(user.number);
    labels.set(label,(labels.get(label)||0)+1);
  }
  for(const user of users){
    // A matching starred radio koppel is ONE operational unit. Its members
    // cannot all be added as independent saved teams, so only the group UI is
    // authoritative for pairing. Keep the shared numeric label recognizable.
    if(user.importable&&labels.get(user.category+'|'+Number(user.number))>1){
      const mates=users.filter(item=>item.category===user.category&&
        /^\d{1,5}$/.test(String(item.number))&&Number(item.number)===Number(user.number));
      if(!mates.some(item=>item.paired===true))user.importable=false;
    }
  }
  return users;
}
async function boundedJSON(response){
  const declared=response.headers?.get?.('content-length');
  if(declared!==null&&declared!==undefined&&/^\d+$/.test(declared)&&Number(declared)>MAX_BYTES){
    await response.body?.cancel?.().catch(()=>{});
    throw new Error('Radio payload too large');
  }
  let source;
  if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];
    let size=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>MAX_BYTES){await reader.cancel().catch(()=>{});throw new Error('Radio payload too large');}
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }else{
    source=await response.text();
    if(Buffer.byteLength(source,'utf8')>MAX_BYTES)throw new Error('Radio payload too large');
  }
  return JSON.parse(source);
}
function payload({configured,connected=false,stale=false,fetchedAt=null,message=null,users=[]}){
  return {configured,connected,stale,fetchedAt,message,users,
    counts:{online:users.length,recognized:users.filter(user=>user.importable).length},refreshSeconds:REFRESH_SECONDS};
}

export function createSonoranRadioService({env=process.env,fetchImpl=fetch,now=Date.now}={}){
  let activeSignature=null,cache=null,lastGood=null,pending=null;
  async function read(){
    const config=configuration(env);
    if(config.signature!==activeSignature){
      activeSignature=config.signature;
      cache=null;lastGood=null;pending=null;
    }
    if(!config.configured)return payload({configured:false,message:CONFIGURATION_MESSAGE});
    const timestamp=now();
    if(cache&&timestamp<cache.expires)return structuredClone(cache.result);
    if(pending?.signature===config.signature)return structuredClone(await pending.promise);
    const job={signature:config.signature,promise:null};
    job.promise=(async()=>{
      let result,failureMessage=SAFE_FAILURE;
      try{
        const response=await fetchImpl(ORIGIN+'/v2/servers/'+encodeURIComponent(config.communityId)+'/connected-users',{
          method:'GET',headers:{Authorization:'Bearer '+config.key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)
        });
        if(!response.ok){
          if(response.status===401||response.status===403)failureMessage='Sonoran weigert de verbinding. Laat een beheerder de Community ID en API Key op de server controleren.';
          else if(response.status===429)failureMessage='Sonoran ontvangt momenteel te veel aanvragen. Wacht even voordat je opnieuw ververst.';
          await response.body?.cancel?.().catch(()=>{});throw new Error('Radio request failed');
        }
        const users=normalizedUsers(await boundedJSON(response),config.key);
        result=payload({configured:true,connected:true,fetchedAt:new Date(now()).toISOString(),users});
      }catch{
        result=payload({configured:true,stale:Boolean(lastGood),fetchedAt:lastGood?.fetchedAt??null,
          users:lastGood?.users??[],message:failureMessage});
      }
      // An old request must not restore cached data after server bindings change.
      if(activeSignature!==config.signature)return read();
      if(result.connected)lastGood=structuredClone(result);
      cache={result:structuredClone(result),expires:now()+REFRESH_SECONDS*1000};
      return result;
    })();
    pending=job;
    try{return structuredClone(await job.promise);}finally{if(pending===job)pending=null;}
  }
  return {read};
}
