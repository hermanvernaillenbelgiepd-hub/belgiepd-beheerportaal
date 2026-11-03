// A signed, server-to-server FiveM telemetry endpoint.
// It stores verified last connection and prior closed calendar month playtime.
// This endpoint never changes personnel status or grants any role.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {verifyBotTelemetrySignature} from './callsign-bot-telemetry.js';
import {discordBotToken} from './discord-bot-refresh.js';
import {ACTIVITY_COLLECTION,ACTIVITY_INGEST_EVENTS,parseActivityTelemetry}
 from './activity-ping-policy.js';

export function activityTelemetryEnabled(env=process.env){
 const secret=String(env.BPD_CALLSIGN_BOT_WEBHOOK_SECRET||'');
 return env.BPD_ENABLE_ACTIVITY_TELEMETRY==='true'&&
  Buffer.byteLength(secret,'utf8')>=32&&
  !/^(CHANGE_ME|PLACEHOLDER|YOUR_|JOUW_)/i.test(secret);
}
async function verifyCurrentDiscordMember(proof,token){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
 let response;
 try{
  response=await fetch('https://discord.com/api/v10/guilds/'+proof.guildId+
   '/members/'+proof.discordId,{
    headers:{Authorization:'Bot '+token},signal:controller.signal
   });
 }finally{clearTimeout(timeout)}
 if(response.status===404)throw Object.assign(Error('Discord-lid niet gevonden'),{status:409});
 if(!response.ok)throw Error('Discord-lidcontrole tijdelijk niet beschikbaar');
 const member=await response.json();
 const timestamp=Date.parse(member?.joined_at||'');
 if(member?.user?.id!==proof.discordId||!Number.isFinite(timestamp)||
   timestamp>Date.now()||timestamp<Date.parse('2015-01-01T00:00:00Z'))
  throw Object.assign(Error('Discord-lidmaatschap niet verifieerbaar'),{status:409});
 return new Date(timestamp).toISOString();
}
export function installActivityTelemetryRoutes(app){
 app.post('/api/activity/bot/telemetry',async(req,res)=>{
  if(!activityTelemetryEnabled(process.env))
   return res.status(503).json({error:'FiveM-activiteitsinvoer staat nog uit'});
  if(!verifyBotTelemetrySignature(req.bpdRawBody,req.headers,
    process.env.BPD_CALLSIGN_BOT_WEBHOOK_SECRET))
   return res.status(401).json({error:'Bot-handtekening ongeldig'});
  let proof;
  try{proof=parseActivityTelemetry(req.body,process.env.DISCORD_GUILD_ID)}
  catch(err){return res.status(400).json({error:err.message})}
  const token=discordBotToken(process.env);
  if(!token)return res.status(503).json({error:'Discord-botcontrole ontbreekt'});
  try{
   const joinedAt=await verifyCurrentDiscordMember(proof,token);
   const db=getFirestore();
   const item=db.collection(ACTIVITY_COLLECTION).doc(proof.discordId);
   const event=db.collection(ACTIVITY_INGEST_EVENTS).doc(proof.eventId);
   await db.runTransaction(async tx=>{
    const [old,existing]=await Promise.all([tx.get(item),tx.get(event)]);
    if(existing.exists)
     throw Object.assign(Error('Deze FiveM-meting is al verwerkt'),{status:409});
    if(old.exists&&Date.parse(old.get('observedAt')||'')>=Date.parse(proof.observedAt))
     throw Object.assign(Error('Nieuwere FiveM-gegevens bestaan reeds'),{status:409});
    tx.create(event,{source:'fivem-activity',discordId:proof.discordId,
     observedAt:proof.observedAt,receivedAt:FieldValue.serverTimestamp()});
    tx.set(item,{
     guildId:proof.guildId,discordId:proof.discordId,
     observedAt:proof.observedAt,
     lastConnectedAt:proof.lastConnectedAt,
     closedMonth:proof.closedMonth,
     closedMonthPlaySeconds:proof.closedMonthPlaySeconds,
     joinedAt,source:'signed-fivem-bot-and-discord-api',
     checkedAt:FieldValue.serverTimestamp()
    });
   });
   res.set('Cache-Control','private, no-store');
   return res.json({accepted:true,stored:true});
  }catch(e){
   if(e?.status)return res.status(e.status).json({error:e.message});
   console.warn('FiveM-activiteitscontrole:',e?.code||'controle_mislukt');
   return res.status(503).json({error:'FiveM-activiteitsgegevens niet opgeslagen'});
  }
 });
}
