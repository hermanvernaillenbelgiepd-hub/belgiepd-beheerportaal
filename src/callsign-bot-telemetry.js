import {createHmac,timingSafeEqual} from 'node:crypto';
import {eligibility,isDiscordId} from './callsign-utils.js';

export const BOT_TELEMETRY_MAX_AGE_MS=5*60*1000;
export function botTelemetryReady(env){
  const secret=String(env.BPD_CALLSIGN_BOT_WEBHOOK_SECRET||'');
  return env.BPD_ENABLE_CALLSIGN_BOT_INGEST==='true'&&
    Buffer.byteLength(secret,'utf8')>=32&&
    !/^(CHANGE_ME|PLACEHOLDER|YOUR_|JOUW_)/i.test(secret);
}
export function verifyBotTelemetrySignature(raw,headers,secret,now=Date.now()){
  const timestamp=String(headers?.['x-bpd-timestamp']??'');
  const signature=String(headers?.['x-bpd-signature']??'');
  if(!Buffer.isBuffer(raw)||raw.length>4096||raw.length===0||
    !/^\d{10}$/.test(timestamp)||!/^[a-f0-9]{64}$/i.test(signature)||
    typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)return false;
  const ms=Number(timestamp)*1000;
  if(!Number.isSafeInteger(ms)||Math.abs(now-ms)>BOT_TELEMETRY_MAX_AGE_MS)return false;
  const expected=createHmac('sha256',secret)
    .update(timestamp+'.','utf8').update(raw).digest();
  const supplied=Buffer.from(signature,'hex');
  return supplied.length===expected.length&&timingSafeEqual(expected,supplied);
}
// Only a server-to-server signed FiveM data source may submit playSeconds.
// Member joined_at is always fetched independently from Discord's REST API.
export function parseBotTelemetry(payload,expectedGuild,now=Date.now()){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).some(k=>!['eventId','guildId','discordId','playSeconds','observedAt','source'].includes(k)))
    throw Error('Ongeldige botgegevens');
  const {eventId,guildId,discordId,playSeconds,observedAt,source}=payload;
  if(!/^[a-zA-Z0-9_-]{12,64}$/.test(eventId||'')||
    !isDiscordId(discordId)||guildId!==expectedGuild||!isDiscordId(guildId)||
    source!=='fivem-playtime'||
    !Number.isSafeInteger(playSeconds)||playSeconds<0||playSeconds>1_000_000_000||
    typeof observedAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(observedAt))
    throw Error('Ongeldige of onvolledige botgegevens');
  const ms=Date.parse(observedAt);
  if(!Number.isFinite(ms)||Math.abs(now-ms)>BOT_TELEMETRY_MAX_AGE_MS)
    throw Error('Botgegevens zijn verouderd of hebben een ongeldige tijd');
  return {eventId,guildId,discordId,playSeconds,observedAt,source};
}
export function verifiedBotEligibility(proof,joinedAt,now=new Date()){
  const timestamp=typeof joinedAt==='string'?Date.parse(joinedAt):NaN;
  if(!Number.isFinite(timestamp)||timestamp>now.getTime()||
    timestamp<new Date('2015-01-01T00:00:00Z').getTime())throw Error('Discord-toetredingsdatum onbetrouwbaar');
  const joinedOn=new Date(timestamp).toISOString().slice(0,10);
  const result=eligibility({joinedOn,playHours:proof.playSeconds/3600},now);
  // Use exact whole-second threshold, without rounding 9h59m59s up to 10h.
  return {...result,hasTenHours:proof.playSeconds>=36000,
    eligible:result.hasFiveDays&&proof.playSeconds>=36000,
    joinedAt:new Date(timestamp).toISOString(),
    playSeconds:proof.playSeconds};
}
