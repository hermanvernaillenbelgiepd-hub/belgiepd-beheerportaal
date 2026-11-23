// Only read-only, service-wide configuration and last accepted ingest timestamps.
// No secrets, personal identifiers, playtime figures or roster data leave this route.
import {getFirestore} from 'firebase-admin/firestore';
import {discordConfig,isDiscordId} from './discord-utils.js';
import {discordBotToken} from './discord-bot-refresh.js';
import {botTelemetryReady} from './callsign-bot-telemetry.js';
import {activityTelemetryEnabled} from './activity-telemetry-routes.js';
import {ACTIVITY_INGEST_EVENTS} from './activity-ping-policy.js';
import {mayOpenTechnicalCenter,mayEditTechnicalSettings} from './technical-center-config.js';
import {inspectDutySchema} from './bpd-duty-schema.js';

const item=(id,title,state,detail,lastReceivedAt=null)=>({id,title,state,detail,lastReceivedAt});
const iso=value=>{
 const date=value?.toDate?.()??(value instanceof Date?value:
   typeof value==='string'?new Date(value):null);
 return date instanceof Date&&Number.isFinite(date.getTime())?date.toISOString():null;
};
function measurement(id,title,enabled,result,now,freshMs){
 if(!enabled)return item(id,title,'disabled','Deze koppeling staat uit of de benodigde botcontrole ontbreekt.');
 if(result.status!=='fulfilled')return item(id,title,'error','De ontvangsthistoriek kon niet worden gecontroleerd.');
 const stamp=iso(result.value?.docs?.[0]?.get('receivedAt'));
 if(!stamp)return item(id,title,'waiting','Ingesteld, maar er is nog geen ondertekende meting gevonden.');
 const age=now-Date.parse(stamp);
 return item(id,title,age>=0&&age<=freshMs?'connected':'waiting',
   age>=0&&age<=freshMs?'Recent een ondertekende meting ontvangen; geen garantie op een live verbinding.':
     'Een eerdere meting bestaat, maar is niet meer recent.',stamp);
}
export function integrationsSummary(actor,env,checks,now=Date.now()){
 const bot=Boolean(discordBotToken(env)&&isDiscordId(env.DISCORD_GUILD_ID));
 const oauth=env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true'&&discordConfig(env).ready;
 const signed=actor?.uid==='discord:'+actor?.discordId&&isDiscordId(actor?.discordId);
 const token=String(env.BPD_DISCORD_USERS_API_TOKEN||'').trim();
 const rolesApi=token.length>=8&&!/^(YOUR_|JOUW_|PLACEHOLDER|CHANGE_ME)/i.test(token);
 const hours=bot&&botTelemetryReady(env),activity=bot&&activityTelemetryEnabled(env);
 return {checkedAt:new Date(now).toISOString(),integrations:[
  item('discord','Discord-aanmelding',oauth&&signed?'connected':'disabled',
    oauth&&signed?'Huidige sessie is door het portaal geverifieerd.':
      'Discord-aanmelding is niet volledig geconfigureerd of deze sessie gebruikt geen Discord.'),
  item('discord-bot','Discord-bot',bot?'configured':'disabled',
    bot?'Bot en server-ID ingesteld. Live bereikbaarheid is niet getest.':
      'Bot-token of server-ID ontbreekt.'),
  item('discord-roles','Discord-leden en rollen',rolesApi?'configured':'disabled',
    rolesApi?'Afzonderlijke leden-API ingesteld; verbinding niet live gecontroleerd.':
      'De afzonderlijke Discord-leden-API is niet ingesteld.'),
  measurement('hours','FiveM-speeluren · vast roepnummer',hours,checks.hours,now,7*86400000),
  measurement('activity','FiveM-activiteit · maanduren',activity,checks.activity,now,36*3600000),
  item('firebase','Firebase / Firestore',checks.firebase.status==='fulfilled'?'connected':'error',
    checks.firebase.status==='fulfilled'?'Databaseantwoord ontvangen bij deze controle.':
      'De databasecontrole is mislukt.')
 ]};
}
export async function readIntegrations({actor,env=process.env,db=getFirestore(),now=Date.now()}){
 const bot=Boolean(discordBotToken(env)&&isDiscordId(env.DISCORD_GUILD_ID));
 const hours=bot&&botTelemetryReady(env);
 const activity=bot&&activityTelemetryEnabled(env);
 const latest=name=>db.collection(name).orderBy('receivedAt','desc').limit(1).get();
 const [firebase,hourResult,activityResult]=await Promise.allSettled([
  db.collection('bpd_portal_technical_settings').doc('automation').get(),
  hours?latest('bpd_callsign_bot_events'):Promise.resolve(null),
  activity?latest(ACTIVITY_INGEST_EVENTS):Promise.resolve(null)
 ]);
 return integrationsSummary(actor,env,{
  firebase,hours:hourResult,activity:activityResult
 },now);
}
export function installTechnicalIntegrationStatusRoutes(app,{
 requireUser,dbFactory=getFirestore,env=process.env,now=Date.now,dutyFetchImpl=fetch
}){
 app.get('/api/technical-center/bpd-duty-schema',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!mayEditTechnicalSettings(req.bpd))
   return res.status(403).json({error:'Alleen Technisch Beheer mag de API-velden controleren'});
  try{
   const [personal,aggregate]=await Promise.all([
    inspectDutySchema('self',req.bpd.discordId,{env,fetchImpl:dutyFetchImpl}),
    inspectDutySchema('all',req.bpd.discordId,{env,fetchImpl:dutyFetchImpl})
   ]);
   return res.json({readOnly:true,checkedAt:new Date(now()).toISOString(),
    personal,aggregate,note:'Alleen technische veldnamen en gegevenstypes; geen diensturen.'});
  }catch{return res.status(503).json({error:'Diensturenstructuur tijdelijk niet beschikbaar'})}
 });
 app.get('/api/technical-center/integrations',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!mayOpenTechnicalCenter(req.bpd))
   return res.status(403).json({error:'Geen toegang tot het Beheercentrum'});
  try{
   return res.json(await readIntegrations({actor:req.bpd,env,db:dbFactory(),now:now()}));
  }catch(error){
   console.warn('Koppelingenstatus:',error?.code||'controle_mislukt');
   return res.status(503).json({error:'Koppelingenstatus tijdelijk niet beschikbaar'});
  }
 });
}
