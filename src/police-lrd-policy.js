import {createHash} from 'node:crypto';
import {getFirestore} from 'firebase-admin/firestore';
import {discordBotToken} from './discord-bot-refresh.js';

// Display-only Discord role evidence; NEVER an authorization source.
export const LRD_DISCORD_ROLE_ID='1380843428354592780';
export const LRD_SPECIALTY_LABEL='LRD (Recherche)';
const DISCORD_ID=/^\d{15,22}$/;
const FRESH_MS=15*60*1000;
const OAUTH_CACHE_MS=30000;
const BOT_CACHE_MS=90000;
const BOT_DIRECT_LIMIT=48;
const BOT_DIRECT_CONCURRENCY=6;
const BOT_LIST_PAGE_SIZE=1000;
const BOT_LIST_MAX_PAGES=20;
const MAX_BYTES=4*1024*1024;

export function verifiedPoliceLrdRole(member,guildId,now=Date.now()){
  return Boolean(typeof guildId==='string'&&guildId.length>0&&
    member?.guildId===guildId&&
    Number.isSafeInteger(member.verifiedAt)&&
    member.verifiedAt<=now&&now-member.verifiedAt<=FRESH_MS&&
    Array.isArray(member.roleIds)&&member.roleIds.includes(LRD_DISCORD_ROLE_ID));
}
function checkedSet(positive,checked,source='unknown',unlinked=[]){
  const value=new Set(positive);
  // No Discord IDs or role payloads are sent directly to the client.
  value.confirmedIds=new Set(checked);
  value.source=source;
  // Bot-verified people not yet present in the police roster. The UI only
  // receives a bounded display name and an unlinked marker, never a Discord ID.
  value.unlinked=unlinked.map(person=>({name:person.name,status:'Niet gekoppeld'}));
  value.unlinkedAvailable=source==='discord-bot';
  return value;
}
const clone=value=>checkedSet(value,value.confirmedIds||[],value.source,value.unlinked||[]);
async function boundedJSON(response){
  const declared=response.headers?.get?.('content-length');
  if(declared&&/^\d+$/.test(declared)&&Number(declared)>MAX_BYTES)
    throw Error('Discord response too large');
  const body=await response.text();
  if(Buffer.byteLength(body,'utf8')>MAX_BYTES)throw Error('Discord response too large');
  return JSON.parse(body);
}
// A full guild snapshot is faster and safer than polling every staff member.
// Discord may require the Server Members Intent for this endpoint. If that
// intent is unavailable, a bounded, cached per-member bot lookup is used.
export async function fetchBotLrdGuildSnapshot(guild,token,{
  fetchImpl=fetch
}={}){
  if(!DISCORD_ID.test(guild)||typeof token!=='string'||token.length<35)
    throw Error('Discord bot not configured');
  const matched=new Set(),seen=new Set();
  matched.displayNames=new Map();
  let after='';
  for(let page=0;page<BOT_LIST_MAX_PAGES;page++){
    const url='https://discord.com/api/v10/guilds/'+guild+'/members?limit='+
      BOT_LIST_PAGE_SIZE+(after?'&after='+after:'');
    const response=await fetchImpl(url,{
      headers:{Authorization:'Bot '+token,Accept:'application/json'},
      method:'GET',redirect:'error',signal:AbortSignal.timeout(8000)
    });
    if(response.status===403)return null;
    if(!response.ok)throw Error('Discord member list temporarily unavailable');
    const rows=await boundedJSON(response);
    if(!Array.isArray(rows)||rows.length>BOT_LIST_PAGE_SIZE)
      throw Error('Invalid Discord member list');
    let last='';
    for(const item of rows){
      const id=item?.user?.id;
      if(!DISCORD_ID.test(String(id||''))||!Array.isArray(item.roles)||
         item.roles.length>500||item.roles.some(role=>!DISCORD_ID.test(role)))
        throw Error('Invalid Discord member');
      if(seen.has(id))throw Error('Duplicate Discord member');
      seen.add(id);
      last=id;
      if(item.roles.includes(LRD_DISCORD_ROLE_ID)){
        matched.add(id);
        // Only keep the nickname or Discord display name for LRD holders.
        // No raw Discord member payloads, role lists or IDs leave the server.
        const raw=[item.nick,item.user?.global_name,item.user?.username]
          .find(v=>typeof v==='string'&&v.trim().length>0)||'Discord-lid';
        const safe=raw.replace(/[\x00-\x1f\x7f<>]/g,' ').trim().slice(0,80);
        matched.displayNames.set(id,safe||'Discord-lid');
      }
    }
    if(rows.length<BOT_LIST_PAGE_SIZE)return matched;
    if(!last||last===after)throw Error('Discord member cursor did not advance');
    after=last;
  }
  throw Error('Discord member list exceeded safe page limit');
}
async function readBotMember(guild,token,id,fetchImpl){
  try{
    const response=await fetchImpl(
      'https://discord.com/api/v10/guilds/'+guild+'/members/'+id,{
        headers:{Authorization:'Bot '+token,Accept:'application/json'},
        method:'GET',redirect:'error',signal:AbortSignal.timeout(6000)
      });
    if(response.status===404)return false;
    if(!response.ok)return null; // 429/5xx/forbidden: not verified
    const member=await boundedJSON(response);
    if(member?.user?.id!==id||!Array.isArray(member.roles)||
       member.roles.length>500||member.roles.some(role=>!DISCORD_ID.test(role)))
      return null;
    return member.roles.includes(LRD_DISCORD_ROLE_ID);
  }catch{return null;}
}
// Discord's bot API is the primary source for dossier LRD membership.
// If the bot cannot read this member, only a recent self-authorised Discord
// OAuth 'guilds.members.read' verification may confirm the role instead.
// A confirmed bot negative (including 404) ALWAYS overrides OAuth evidence.
// The result is display-only; it never grants permission or changes Discord.
export function createPoliceLrdSubjectVerifier({
  guildId=()=>process.env.DISCORD_GUILD_ID,
  botToken=()=>discordBotToken(process.env),
  firestore=()=>getFirestore(),fetchImpl=fetch,now=Date.now
}={}){
  const cache=new Map(),pending=new Map();
  async function recentlyVerifiedOAuth(id,guild){
    try{
      const snap=await firestore().collection('bpd_discord_auth').doc(id).get();
      const member=snap?.exists?snap.data():null;
      return verifiedPoliceLrdRole(member,guild,now())?
        {verified:true,verifiedAt:member.verifiedAt}:null;
    }catch{return null;}
  }
  return async function subjectHasDiscordLrd(id){
    const guild=guildId(),token=botToken();
    if(!DISCORD_ID.test(String(id||''))||
       !DISCORD_ID.test(String(guild||'')))return false;
    const botConfigured=typeof token==='string'&&token.length>=35;
    const key=guild+':'+id+':'+(botConfigured?
      createHash('sha256').update(token).digest('hex'):'no-bot');
    const stored=cache.get(key),time=now();
    if(stored&&stored.until>time)return stored.value;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      const result=botConfigured?await readBotMember(guild,token,id,fetchImpl):null;
      // Confirmed response from Discord's bot takes precedence, including
      // removed/absent roles. It is never replaced with cached OAuth data.
      if(result!==null){
        if(cache.size>=1000)cache.clear();
        cache.set(key,{value:result,until:now()+60000});
        return result;
      }
      // No bot membership response: use only fresh user-approved role data.
      // OAuth access tokens are not persisted; the trusted server stored the
      // role evidence after Discord's own guild-member OAuth endpoint replied.
      const oauth=await recentlyVerifiedOAuth(id,guild);
      if(!oauth)return false;
      if(cache.size>=1000)cache.clear();
      const until=Math.min(now()+30000,oauth.verifiedAt+FRESH_MS);
      if(until>now())cache.set(key,{value:true,until});
      return true;
    })();
    pending.set(key,task);
    try{return await task}finally{if(pending.get(key)===task)pending.delete(key);}
  };
}
export const verifiedPoliceLrdSubject=createPoliceLrdSubjectVerifier();

export function createPoliceLrdIndex({
  firestore=()=>getFirestore(),guildId=()=>process.env.DISCORD_GUILD_ID,
  now=Date.now,botToken=()=>discordBotToken(process.env),fetchImpl=fetch
}={}){
  let activeConfig=null,cache=null,pending=null;
  let guildMembers=null,listExpires=0,listUnsupportedUntil=0;
  let directFailureUntil=0;
  const individual=new Map();
  function reset(signature){
    if(activeConfig===signature)return;
    activeConfig=signature;cache=null;pending=null;guildMembers=null;
    listExpires=0;listUnsupportedUntil=0;directFailureUntil=0;
    individual.clear();
  }
  async function oauthFallback(ids,guild,positive,checked){
    const db=firestore();
    for(let start=0;start<ids.length;start+=50){
      const group=ids.slice(start,start+50);
      const docs=await db.getAll(...group.map(id=>db.collection('bpd_discord_auth').doc(id)));
      if(docs.length!==group.length)throw Error('LRD-verificatie is onvolledig');
      for(let i=0;i<docs.length;i++){
        if(docs[i]?.exists){
          const member=docs[i].data();
          if(member?.guildId===guild&&
             Number.isSafeInteger(member.verifiedAt)&&member.verifiedAt<=now()&&
             now()-member.verifiedAt<=FRESH_MS&&Array.isArray(member.roleIds)){
            checked.add(group[i]);
            if(verifiedPoliceLrdRole(member,guild,now()))positive.add(group[i]);
          }
        }
      }
    }
  }
  return async function verifiedMemberIds(roster){
    const ids=[...new Set((Array.isArray(roster)?roster:[])
      .filter(p=>p?.dept==='politie'&&DISCORD_ID.test(String(p.personId||'')))
      .map(p=>p.personId))].sort().slice(0,500);
    const guild=guildId(),token=botToken();
    const validBot=DISCORD_ID.test(String(guild||''))&&
      typeof token==='string'&&token.length>=35;
    // Hash a secret only inside the process, never in a message or response.
    const configuration=JSON.stringify([guild,validBot?
      createHash('sha256').update(token).digest('hex'):'not-configured']);
    reset(configuration);
    const signature=JSON.stringify([configuration,ids]);
    if(cache?.signature===signature&&now()<cache.expires)return clone(cache.value);
    if(pending?.signature===signature)return clone(await pending.promise);
    const job={signature,promise:null};
    job.promise=(async()=>{
      const positive=new Set(),checked=new Set();
      let source='oauth-cache',complete=true;
      let canUseDirect=now()<listUnsupportedUntil;
      if(validBot&&ids.length){
        if(guildMembers&&now()<listExpires){
          for(const id of ids){
            checked.add(id);
            if(guildMembers.has(id))positive.add(id);
          }
          source='discord-bot';
        }else if(now()>=listUnsupportedUntil){
          try{
            const snapshot=await fetchBotLrdGuildSnapshot(guild,token,{fetchImpl});
            if(snapshot){
              if(activeConfig===configuration){
                guildMembers=snapshot;listExpires=now()+BOT_CACHE_MS;
              }
              for(const id of ids){checked.add(id);if(snapshot.has(id))positive.add(id);}
              source='discord-bot';
            }else{
              if(activeConfig===configuration)
                listUnsupportedUntil=now()+10*60*1000;
              canUseDirect=true;
            }
          }catch{/* Bot errors are not evidence that any member lacks LRD. */}
        }
        if(source!=='discord-bot'&&canUseDirect&&now()>=directFailureUntil){
          // Server Members Intent unavailable: refresh a limited number of
          // roster members per request. Subsequent calls continue the scan.
          const expired=ids.filter(id=>!individual.has(id)||
            now()-individual.get(id).at>=BOT_CACHE_MS);
          const queue=expired.slice(0,BOT_DIRECT_LIMIT);
          let successfulReads=0;
          for(let i=0;i<queue.length;i+=BOT_DIRECT_CONCURRENCY){
            const batch=queue.slice(i,i+BOT_DIRECT_CONCURRENCY);
            const verified=await Promise.all(batch.map(id=>readBotMember(
              guild,token,id,fetchImpl)));
            for(let j=0;j<batch.length;j++){
              if(verified[j]!==null){
                successfulReads++;
                if(activeConfig===configuration)
                  individual.set(batch[j],{present:verified[j],at:now()});
              }
            }
          }
          if(queue.length&&!successfulReads&&activeConfig===configuration)
            directFailureUntil=now()+60000;
          for(const id of ids){
            const record=individual.get(id);
            if(record&&now()-record.at<BOT_CACHE_MS){
              checked.add(id);
              if(record.present)positive.add(id);
            }
          }
          source=checked.size?'discord-bot-direct':'oauth-cache';
          complete=checked.size===ids.length;
        }
      }
      // Only fresh guild-bound snapshots may supplement bot results.
      // Never let old OAuth evidence override a confirmed bot negative.
      const missing=ids.filter(id=>!checked.has(id));
      if(missing.length)await oauthFallback(missing,guild,positive,checked);
      if(activeConfig!==configuration)return verifiedMemberIds(roster);
      // Do not assume Discord-only people are staff. Display them in a
      // separate, read-only reconciliation list, never in the dossier roster.
      // Only complete guild enumerations can identify unlinked members.
      const linkedIds=new Set(ids);
      const unlinked=source==='discord-bot'&&guildMembers?.displayNames?
        [...guildMembers.displayNames.entries()]
          .filter(([id])=>!linkedIds.has(id))
          .slice(0,200)
          .map(([,name])=>({name}))
          .sort((a,b)=>a.name.localeCompare(b.name,'nl-BE')):[];
      const value=checkedSet(positive,checked,source,unlinked);
      const ttl=validBot&&source!=='discord-bot'&&!complete?
        1000:source==='discord-bot'?BOT_CACHE_MS:OAUTH_CACHE_MS;
      if(activeConfig===configuration)
        cache={signature,value,expires:now()+ttl};
      return value;
    })();
    pending=job;
    try{return clone(await job.promise)}
    finally{if(pending===job)pending=null;}
  };
}
// Both the protected and the ordinary police roster use the SAME process
// cache and the SAME bot evidence, preventing repeated Discord API scans.
export const readVerifiedPoliceLrd=createPoliceLrdIndex();
