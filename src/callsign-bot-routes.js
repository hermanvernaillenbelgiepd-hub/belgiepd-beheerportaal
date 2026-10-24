import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {botTelemetryReady,verifyBotTelemetrySignature,
  parseBotTelemetry,verifiedBotEligibility} from './callsign-bot-telemetry.js';
import {discordBotToken} from './discord-bot-refresh.js';

// The FiveM time authority must opt in with a separately shared signing
// secret. No Discord role, client-submitted JSON or manual screenshot can
// assert an automated eligibility result.
export function installCallsignBotRoutes(app){
  app.post('/api/callsigns/bot/telemetry',async(req,res)=>{
    if(!botTelemetryReady(process.env))
      return res.status(503).json({error:'Automatische botgegevens staan nog uit'});
    if(!verifyBotTelemetrySignature(req.bpdRawBody,req.headers,
      process.env.BPD_CALLSIGN_BOT_WEBHOOK_SECRET))
      return res.status(401).json({error:'Botverificatie mislukt'});
    let proof;
    try{proof=parseBotTelemetry(req.body,process.env.DISCORD_GUILD_ID)}
    catch(e){return res.status(400).json({error:e.message})}
    const token=discordBotToken(process.env);
    if(!token)return res.status(503).json({error:'Serververificatie via Discord is niet beschikbaar'});
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),5000);
      let response;
      try{
        response=await fetch('https://discord.com/api/v10/guilds/'+proof.guildId+
          '/members/'+proof.discordId,{
            headers:{Authorization:'Bot '+token},signal:controller.signal
          });
      }finally{clearTimeout(timeout)}
      if(response.status===404)
        return res.status(409).json({error:'Discord-lid niet gevonden'});
      if(!response.ok)
        return res.status(503).json({error:'Discord kon het lidmaatschap niet verifiëren'});
      const member=await response.json();
      if(member?.user?.id!==proof.discordId||typeof member?.joined_at!=='string')
        return res.status(409).json({error:'Discord-lidmaatschap komt niet overeen'});
      const verified=verifiedBotEligibility(proof,member.joined_at);
      const db=getFirestore(),ref=db.collection('bpd_callsign_requests').doc(proof.discordId);
      const eventRef=db.collection('bpd_callsign_bot_events').doc(proof.eventId);
      // Proof is independent of a pending request, allowing new members to
      // verify conditions before requesting their first permanent callsign.
      const evidenceRef=db.collection('bpd_callsign_eligibility_proofs').doc(proof.discordId);
      const status=verified.eligible?'verified':'needs_verification';
      await db.runTransaction(async tx=>{
        const [request,event]=await Promise.all([tx.get(ref),tx.get(eventRef)]);
        if(event.exists)
          throw Object.assign(Error('Deze botcontrole is al verwerkt'),{status:409});
        const at=FieldValue.serverTimestamp();
        tx.create(eventRef,{
          discordId:proof.discordId,guildId:proof.guildId,receivedAt:at,
          source:'fivem-playtime',observedAt:proof.observedAt,eligible:verified.eligible
        });
        const verifiedAt=new Date().toISOString();
        const evidence={...verified,discordId:proof.discordId,
          guildId:proof.guildId,source:'fivem-bot-en-discord-api',
          checkedAt:verifiedAt,observedAt:proof.observedAt,
          verifiedBy:'signed-bot-transport'};
        tx.set(evidenceRef,evidence);
        // Don't modify completed/rejected requests when telemetry continues.
        if(request.exists&&['submitted','needs_verification','verified'].includes(request.get('status'))){
          tx.update(ref,{status,verification:evidence,updatedAt:at});
          tx.create(ref.collection('verification_audit').doc(),{
            source:'fivem-playtime',eventId:proof.eventId,
            eligible:verified.eligible,joinedOn:verified.joinedOn,
            playSeconds:proof.playSeconds,at
          });
        }
      });
      return res.json({accepted:true,discordId:proof.discordId,status,
        eligible:verified.eligible,hasTenHours:verified.hasTenHours,
        hasFiveDays:verified.hasFiveDays});
    }catch(e){
      if(e?.status)return res.status(e.status).json({error:e.message});
      console.error('Bot-telemetrie:',e?.code||e?.message||'onbekende fout');
      return res.status(503).json({error:'Botgegevens konden niet veilig worden verwerkt'});
    }
  });
}
