import {discordBotToken} from './discord-bot-refresh.js';
import {discordConfig,isDiscordId} from './discord-utils.js';
import {ROLE_CATALOG} from './role-catalog.js';

// Read-only diagnostics: never return tokens, URLs containing credentials,
// Discord member IDs, user names or raw Discord API payloads.
const VALID_STATES=new Set(['ok','not_configured','unauthorized','forbidden',
  'rate_limited','not_found','unavailable','invalid_response']);
const MAX_RESPONSE_BYTES=160*1024;
const TIMEOUT_MS=5500;
export function diagnosticState(httpStatus){
  if(httpStatus===401)return 'unauthorized';
  if(httpStatus===403)return 'forbidden';
  if(httpStatus===404)return 'not_found';
  if(httpStatus===429)return 'rate_limited';
  return 'unavailable';
}
export function diagnosisAccess(actor,member,appointment,guild,verifyBoard,activeAppointment){
  const id=String(actor?.discordId||'');
  if(!isDiscordId(id)||actor?.uid!=='discord:'+id)return null;
  if(verifyBoard(member,guild))return 'geverifieerde_bestuursrol';
  if(activeAppointment(appointment))return 'goedgekeurde_bestuursaanstelling';
  return null;
}
export function ageStatus(member,guild,at=Date.now()){
  if(member?.guildId!==guild||!Number.isSafeInteger(member?.verifiedAt)||
    member.verifiedAt<=0||member.verifiedAt>at)return {status:'missing',ageMinutes:null};
  const age=Math.floor((at-member.verifiedAt)/60000);
  return {status:at-member.verifiedAt<=15*60000?'fresh':'stale',
    ageMinutes:Math.max(0,Math.min(age,100000))};
}
const safeResponse={status:'unavailable'};
async function probe(url,token,{fetchImpl=fetch,limit=MAX_RESPONSE_BYTES}={}){
  try{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',
      headers:{Authorization:'Bot '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(TIMEOUT_MS)});
    if(!response.ok)return {status:diagnosticState(response.status)};
    const declared=response.headers?.get?.('content-length');
    if(declared&&/^\d+$/.test(declared)&&Number(declared)>limit)
      return {status:'invalid_response'};
    const raw=await response.text();
    if(Buffer.byteLength(raw,'utf8')>limit)return {status:'invalid_response'};
    const data=JSON.parse(raw);
    return {status:'ok',data};
  }catch{return safeResponse;}
}
export async function collectDiscordDiagnosis({
  env=process.env,ownId,ownMember=null,accessSource='',
  fetchImpl=fetch,at=Date.now()
}={}){
  const guild=String(env.DISCORD_GUILD_ID||''),token=discordBotToken(env);
  const botConfigured=Boolean(token),guildConfigured=isDiscordId(guild);
  const oauthConfigured=discordConfig(env).ready;
  const own=ageStatus(ownMember,guild,at);
  const result={mode:'alleen-lezen',environment:'TEST',checkedAt:new Date(at).toISOString(),
    authorization:accessSource,
    configuration:{botConfigured,guildConfigured,oauthConfigured},
    ownVerification:{...own,
      roleCount:own.status==='fresh'&&Array.isArray(ownMember?.roleIds)?
        Math.min(ownMember.roleIds.length,500):null},
    probes:{
      botIdentity:{status:'not_configured'},
      guildRoles:{status:'not_configured',catalogRecognized:null,totalRoles:null,
        rechercheRole:'unknown'},
      memberListing:{status:'not_configured',sampleCount:null,
        completeCoverageVerified:false},
      ownMember:{status:'not_configured',roleAgreement:'unknown'}
    },
    notes:[]};
  if(!botConfigured||!guildConfigured){
    result.notes.push('Bot- of Discord-serverinstelling ontbreekt. Controleer de beveiligde Render-omgevingsvariabelen op TEST.');
    return result;
  }
  const root='https://discord.com/api/v10';
  const [identity,roles,listing,mine]=await Promise.all([
    probe(root+'/users/@me',token,{fetchImpl,limit:15000}),
    probe(root+'/guilds/'+guild+'/roles',token,{fetchImpl}),
    probe(root+'/guilds/'+guild+'/members?limit=1',token,{fetchImpl,limit:12000}),
    isDiscordId(ownId)?probe(root+'/guilds/'+guild+'/members/'+ownId,token,{fetchImpl,limit:16000}):
      Promise.resolve({status:'not_configured'})
  ]);
  result.probes.botIdentity={status:identity.status==='ok'&&
    isDiscordId(identity.data?.id)&&identity.data?.bot===true?'ok':
    identity.status==='ok'?'invalid_response':identity.status};
  if(roles.status==='ok'&&Array.isArray(roles.data)&&roles.data.length<=1000&&
    roles.data.every(item=>isDiscordId(item?.id))){
    const seen=new Set(roles.data.map(item=>item.id));
    result.probes.guildRoles={status:'ok',totalRoles:roles.data.length,
      catalogRecognized:new Set(ROLE_CATALOG.map(x=>x.id).filter(id=>seen.has(id))).size,
      rechercheRole:seen.has('1380843428354592780')?'present':'absent'};
  }else result.probes.guildRoles={...result.probes.guildRoles,
    status:roles.status==='ok'?'invalid_response':roles.status};
  if(listing.status==='ok'&&Array.isArray(listing.data)&&listing.data.length<=1){
    result.probes.memberListing={status:'ok',sampleCount:listing.data.length,
      completeCoverageVerified:false};
  }else result.probes.memberListing={...result.probes.memberListing,
    status:listing.status==='ok'?'invalid_response':listing.status};
  if(mine.status==='ok'&&Array.isArray(mine.data?.roles)&&
    mine.data.user?.id===ownId&&mine.data.roles.length<=500&&
    mine.data.roles.every(isDiscordId)){
    const cached=own.status==='fresh'&&Array.isArray(ownMember?.roleIds)?
      new Set(ownMember.roleIds):null;
    const observed=new Set(mine.data.roles);
    const same=cached&&cached.size===observed.size&&
      [...cached].every(id=>observed.has(id));
    result.probes.ownMember={status:'ok',
      roleAgreement:cached?(same?'match':'different'):'not_comparable'};
  }else result.probes.ownMember={status:mine.status==='ok'?'invalid_response':
    mine.status,roleAgreement:'unknown'};
  if(result.probes.memberListing.status!=='ok')
    result.notes.push('De bot kan de ledenlijst niet betrouwbaar testen. Controleer Server Members Intent en de bottoegang in Discord.');
  else result.notes.push('Een geslaagde aanvraag van één lid bevestigt geen volledige ledenlijst of voortdurende synchronisatie.');
  if(result.probes.guildRoles.status!=='ok')
    result.notes.push('De rolcatalogus is niet uit te lezen. Controleer botlidmaatschap, autorisatie en eventuele Discord-fouten.');
  if(result.probes.ownMember.roleAgreement==='different')
    result.notes.push('De actuele rollen verschillen van je opgeslagen verificatie. Vernieuw je eigen Discord-rollen.');
  if(own.status!=='fresh')
    result.notes.push('Je opgeslagen Discord-rolverificatie is verouderd of ontbreekt. Meld je opnieuw aan met Discord.');
  return result;
}
