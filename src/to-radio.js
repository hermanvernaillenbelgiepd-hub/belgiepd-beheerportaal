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
// User-defined service prefixes may carry a one-to-five-digit number with a
// hyphen, a space or no separator (BWV123, DEPK-45, AMB 620).
// Named specialist LSRA and ZONE categories take precedence when they match.
const compactNumberedLabels=new Set([
  'ZW','STAGE','DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','CANINE',
  'BWM','BWV','BAMBU','BWAMBU','BW-AMBU','KORP','SERG','ADJ','LT','KAP','MAJ','KOL','ZONE','STAG',
  'LSRA','DEPK'
]);

// A callsign is an operational label, never proof of a personnel identity.
export function parseSonoranName(value){
  const none={category:null,number:null,displayName:null,importable:false};
  if(typeof value!=='string')return none;
  const name=clean(value);
  // Sonoran labels also arrive with visually similar Unicode separators.
  // Split these before parsing a numeric callsign so a display name cannot
  // accidentally become part of the unit number (SANTO-180 │ JayD).
  const [label,...nameParts]=name.split(/[|│｜¦∣]/);
  const head=stripRadioNBMarkers(label.trim()).replace(/\*\s*$/,'').trim(),upper=head.toUpperCase();
  const displayName=nameParts.join('|').trim().slice(0,160)||null;
  // Embedded digits belong to the label (e.g. LSRA-DEPA100), not an officer.
  // HARTS and HVPK are named dispatchable ambulance units: the on-duty
  // professional can change while the operational team keeps its callsign.
  const namedUnits=new Set(['HARTS','HVPK']);
  const named=orderedCategories.find(category=>namedUnits.has(category)&&
    upper.startsWith(category)&&/^(?:\s*-\s*|\s+)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{0,77}$/.test(head.slice(category.length)));
  if(named){
    const operator=head.slice(named.length).replace(/^\s*-\s*|\s+/,'').trim();
    return {category:named,number:named,displayName:displayName||operator,importable:true};
  }
  if(namedUnits.has(upper))
    return {category:upper,number:upper,displayName,importable:true};
  // Sonoran can show a name after a *number* without a pipe separator:
  // e.g. "SANTO-265 Chicken". Never store "265 Chicken" as a callsign.
  const inlineOperator=orderedCategories.find(category=>upper.startsWith(category)&&
    /^\s*-\s*\d{1,5}\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{0,77}$/.test(head.slice(category.length)));
  if(inlineOperator){
    const match=/^\s*-\s*(\d{1,5})\s+(.+)$/.exec(head.slice(inlineOperator.length));
    return {category:inlineOperator,number:match[1],displayName:displayName||match[2].trim(),
      importable:Number(match[1])>0&&inlineOperator!=='OPLEIDING'};
  }
  if(TO_CATEGORIES.includes(upper))return {category:upper,number:null,displayName,importable:false};
  const compact=orderedCategories.find(category=>compactNumberedLabels.has(category)&&
    upper.startsWith(category)&&/^(?:\s*-\s*|\s+)?\d{1,5}$/.test(head.slice(category.length)));
  if(compact){
    const number=head.slice(compact.length).replace(/^\s*-\s*/,'').trim();
    return {category:compact,number,displayName,importable:Number(number)>0};
  }
  const known=orderedCategories.find(category=>upper.startsWith(category)&&/^\s*-\s*/.test(head.slice(category.length)));
  const parts=known?null:/^([A-Za-z][A-Za-z0-9_-]{0,29}?)\s*-\s*(.+)$/.exec(head);
  // Recovery callsigns can have non-numeric specialist suffixes. Show all
  // labels starting LSRA/DEPK under Depannage, but do not invent a number.
  if(!known&&!parts){
    const recovery=['LSRA','DEPK'].find(prefix=>upper.startsWith(prefix));
    return recovery?{category:recovery,number:null,displayName,importable:false}:none;
  }
  const categoryLabel=known||parts[1].trim().toUpperCase();
  // Nonstandard specialist labels with a recovery prefix remain visible under
  // Depannage, but cannot impersonate a recognized importable unit.
  const recoveredPrefix=!TO_CATEGORIES.includes(categoryLabel)&&
    ['LSRA','DEPK'].find(prefix=>categoryLabel.startsWith(prefix));
  const category=recoveredPrefix||categoryLabel;
  const number=known?head.slice(known.length).replace(/^\s*-\s*/,'').trim():parts[2].trim();
  const importable=category!=='OPLEIDING'&&!recoveredPrefix&&TO_CATEGORIES.includes(category)&&/^\d{1,5}$/.test(number)&&Number(number)>0;
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
// Sonoran Radio v2's connected-users endpoint serializes "metadata" as a
// JSON STRING, unlike v1 (object). roomId is a multi-server room, never a channel.
// Never publish upstream metadata, connection identities or raw API messages.
function radioChannelState(metadata){
  let source=metadata;
  if(typeof source==='string'){
    // Per-user metadata is tiny in the API. Reject unexpected large inputs.
    if(!source.length||source.length>8192)return {channels:[],known:false};
    try{source=JSON.parse(source);}catch{return {channels:[],known:false};}
  }
  if(!source||typeof source!=='object'||Array.isArray(source))return {channels:[],known:false};
  const state=source.state;
  if(!state||typeof state!=='object'||Array.isArray(state))return {channels:[],known:false};
  const known=Object.hasOwn(state,'primaryChId')||
    Array.isArray(state.primaryChIds)||Array.isArray(state.scannedChIds);
  if(!known)return {channels:[],known:false};
  const valid=id=>{
    // Some API clients serialize channel numbers as strings.
    const n=typeof id==='number'?id:
      typeof id==='string'&&/^[1-9][0-9]{0,8}$/.test(id)?Number(id):null;
    return Number.isSafeInteger(n)&&n>0?String(n):null;
  };
  const channels=[];
  const append=id=>{const channel=valid(id);if(channel&&!channels.includes(channel))channels.push(channel);};
  append(state.primaryChId);
  if(Array.isArray(state.primaryChIds))for(const id of state.primaryChIds.slice(0,128))append(id);
  if(Array.isArray(state.scannedChIds))for(const id of state.scannedChIds.slice(0,128))append(id);
  return {channels,known:true};
}
export function activeSonoranChannels(metadata){return radioChannelState(metadata).channels;}
function normalizedUsers(payload,key){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.connectedUsers)||payload.connectedUsers.length>MAX_USERS)
    throw new Error('Invalid radio payload');
  const users=[],identities=new Set();
  let channelStatusUnknown=0,notInChannel=0;
  const uncertainUnits=new Map();
  for(const row of payload.connectedUsers){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Invalid radio row');
    if(row.identity!=null&&(typeof row.identity!=='string'||row.identity.length>512))throw new Error('Invalid radio identity');
    if(row.name!=null&&(typeof row.name!=='string'||row.name.length>512))throw new Error('Invalid radio name');
    if(row.roomId!=null&&!(typeof row.roomId==='string'&&row.roomId.length<=80)&&!(typeof row.roomId==='number'&&Number.isSafeInteger(row.roomId)&&row.roomId>=0))
      throw new Error('Invalid radio channel');
    const identity=typeof row.identity==='string'?clean(row.identity):'';
    const rawName=typeof row.name==='string'?clean(row.name):'';
    if(!identity&&!rawName)throw new Error('Missing radio identity');
    const {channels,known}=radioChannelState(row.metadata);
    if(!known){
      channelStatusUnknown++;
      const parsed=parseSonoranName(protect(rawName,key));
      if(parsed.category&&typeof parsed.number==='string'&&
          ((/^\d{1,5}$/.test(parsed.number)&&Number(parsed.number)>0)||
           (['HARTS','HVPK'].includes(parsed.category)&&parsed.number===parsed.category))){
        const unit=JSON.stringify([parsed.category,parsed.number===parsed.category?parsed.number:Number(parsed.number)]);
        uncertainUnits.set(unit,{category:parsed.category,number:parsed.number});
      }
      continue;
    }
    if(!channels.length){notInChannel++;continue;}
    const channel=channels[0];
    const stableIdentity=identity?'identity:'+identity:JSON.stringify(['name',rawName,channel]);
    if(identities.has(stableIdentity))continue;
    identities.add(stableIdentity);
    const name=protect(rawName,key),parsed=parseSonoranName(name);
    users.push({id:'radio_'+hash('sonoran-user\0'+stableIdentity).slice(0,32),labelEditable:Boolean(identity),name:name.slice(0,160)||'Onbekende gebruiker',
      channel:channel===null?null:protect(channel,key).slice(0,80),
      notAvailable:radioMarkedUnavailable(name),paired:radioMarkedPair(name)&&parsed.importable,...parsed});
  }
  const labels=new Map();
  for(const user of users){
    if(!user.importable)continue;
    const label=user.category+'|'+(['HARTS','HVPK'].includes(user.category)&&user.number===user.category?user.number:Number(user.number));
    labels.set(label,(labels.get(label)||0)+1);
  }
  for(const user of users){
    // A matching starred radio koppel is ONE operational unit. Its members
    // cannot all be added as independent saved teams, so only the group UI is
    // authoritative for pairing. Keep the shared numeric label recognizable.
    if(user.importable&&labels.get(user.category+'|'+(['HARTS','HVPK'].includes(user.category)&&user.number===user.category?user.number:Number(user.number)))>1){
      const mates=users.filter(item=>item.category===user.category&&
        (user.number===user.category?item.number===user.category:(/^\d{1,5}$/.test(String(item.number))&&Number(item.number)===Number(user.number))));
      if(!mates.some(item=>item.paired===true))user.importable=false;
    }
  }
  return {users,connectedCount:payload.connectedUsers.length,channelStatusUnknown,notInChannel,uncertainUnits:[...uncertainUnits.values()]};
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
function payload({configured,connected=false,stale=false,fetchedAt=null,message=null,users=[],connectedCount=0,channelStatusUnknown=0,notInChannel=0,uncertainUnits=[]}){
  return {configured,connected,stale,fetchedAt,message,users,connectedCount,channelStatusUnknown,notInChannel,uncertainUnits,
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
        const {users,connectedCount,channelStatusUnknown,notInChannel,uncertainUnits}=normalizedUsers(await boundedJSON(response),config.key);
        result=payload({configured:true,connected:true,fetchedAt:new Date(now()).toISOString(),users,connectedCount,channelStatusUnknown,notInChannel,uncertainUnits});
      }catch{
        result=payload({configured:true,stale:Boolean(lastGood),fetchedAt:lastGood?.fetchedAt??null,
          users:lastGood?.users??[],connectedCount:lastGood?.connectedCount??0,
          channelStatusUnknown:lastGood?.channelStatusUnknown??0,notInChannel:lastGood?.notInChannel??0,uncertainUnits:lastGood?.uncertainUnits??[],message:failureMessage});
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
