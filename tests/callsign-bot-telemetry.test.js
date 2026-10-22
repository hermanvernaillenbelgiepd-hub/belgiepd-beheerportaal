import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 botTelemetryReady,verifyBotTelemetrySignature,parseBotTelemetry,
 verifiedBotEligibility,BOT_TELEMETRY_MAX_AGE_MS
} from '../src/callsign-bot-telemetry.js';

const guild='123456789012345678',id='234567890123456789';
const secret='A-completely-random-shared-hmac-key-that-is-long-enough';
const now=Date.parse('2026-10-22T12:15:00Z');
const payload={eventId:'playtime-unique-test-123',guildId:guild,
 discordId:id,playSeconds:36000,
 observedAt:new Date(now).toISOString(),source:'fivem-playtime'};
function signed(input=payload,seconds=Math.floor(now/1000)){
 const raw=Buffer.from(JSON.stringify(input));
 return {raw,headers:{
  'x-bpd-timestamp':String(seconds),
  'x-bpd-signature':createHmac('sha256',secret)
    .update(String(seconds)+'.').update(raw).digest('hex')
 }};
}
test('Transport remains disabled until explicitly configured with a strong secret',()=>{
 assert.equal(botTelemetryReady({}),false);
 assert.equal(botTelemetryReady({BPD_ENABLE_CALLSIGN_BOT_INGEST:'true',
  BPD_CALLSIGN_BOT_WEBHOOK_SECRET:'short'}),false);
 assert.equal(botTelemetryReady({BPD_ENABLE_CALLSIGN_BOT_INGEST:'false',
  BPD_CALLSIGN_BOT_WEBHOOK_SECRET:secret}),false);
 assert.equal(botTelemetryReady({BPD_ENABLE_CALLSIGN_BOT_INGEST:'true',
  BPD_CALLSIGN_BOT_WEBHOOK_SECRET:secret}),true);
});
test('Timestamped HMAC covers the exact raw JSON bytes and rejects tampering/replay window',()=>{
 const {raw,headers}=signed();
 assert.equal(verifyBotTelemetrySignature(raw,headers,secret,now),true);
 assert.equal(verifyBotTelemetrySignature(Buffer.from(raw.toString().replace('36000','99999')),headers,secret,now),false);
 assert.equal(verifyBotTelemetrySignature(raw,headers,secret,now+BOT_TELEMETRY_MAX_AGE_MS+1),false);
 assert.equal(verifyBotTelemetrySignature(raw,{...headers,'x-bpd-signature':'00'.repeat(32)},secret,now),false);
 assert.equal(verifyBotTelemetrySignature(raw,{...headers,'x-bpd-timestamp':'1690000000'},secret,now),false);
 assert.equal(verifyBotTelemetrySignature(raw,{...headers,'x-bpd-signature':'garbage'},secret,now),false);
});
test('Bot proof must match trusted guild and source, have valid seconds and fresh observation',()=>{
 assert.deepEqual(parseBotTelemetry(payload,guild,now),payload);
 for(const bad of [
  {...payload,guildId:'999999999999999999'},
  {...payload,source:'member-screenshot'},
  {...payload,playSeconds:-1},
  {...payload,playSeconds:36000.5},
  {...payload,playSeconds:9999999999},
  {...payload,eventId:'bad'},
  {...payload,discordId:'not-a-discord-id'},
  {...payload,observedAt:'2026-10-01T12:00:00.000Z'},
  {...payload,role:'korpsleiding'}
 ])assert.throws(()=>parseBotTelemetry(bad,guild,now));
});
test('5 full calendar days and 10 complete hours must BOTH be satisfied',()=>{
 const join='2026-10-15T16:23:00Z';
 const valid=verifiedBotEligibility(payload,join,new Date(now));
 assert.equal(valid.eligible,true);
 assert.equal(valid.hasTenHours,true);
 assert.equal(valid.hasFiveDays,true);
 assert.equal(valid.joinedOn,'2026-10-15');
 assert.equal(verifiedBotEligibility({...payload,playSeconds:35999},join,new Date(now)).eligible,false);
 assert.equal(verifiedBotEligibility(payload,'2026-10-19T12:00:00Z',new Date(now)).eligible,false);
 assert.throws(()=>verifiedBotEligibility(payload,'not-a-date',new Date(now)));
 assert.throws(()=>verifiedBotEligibility(payload,'2026-10-23T00:00:00Z',new Date(now)));
});
test('API is signature-only, checks real Discord member and existing pending request, no auto-approval',()=>{
 const src=readFileSync(new URL('../src/callsign-bot-routes.js',import.meta.url),'utf8');
 const srv=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const call=readFileSync(new URL('../src/callsign-routes.js',import.meta.url),'utf8');
 assert.ok(src.includes("app.post('/api/callsigns/bot/telemetry'"));
 assert.ok(src.includes('verifyBotTelemetrySignature(req.bpdRawBody,req.headers,'));
 assert.ok(src.includes("'/members/'+proof.discordId"));
 assert.ok(src.includes('tx.get(eventRef)'));
 assert.ok(src.includes("!['submitted','needs_verification','verified'].includes"));
 assert.ok(src.includes("status=verified.eligible?'verified':'needs_verification'"));
 assert.equal(src.includes("status:'approved'"),false);
 assert.ok(srv.includes('verify:(req,_res,raw)=>{req.bpdRawBody=Buffer.from(raw)}'));
 assert.ok(srv.includes('installCallsignBotRoutes(app)'));
 assert.ok(call.includes("verificationSource:x.verification?.source||null"));
});

test('Production callsign and specialization modules load with matching exports',async()=>{
 const a=await import('../src/callsign-routes.js');
 const b=await import('../src/specialization-policy.js');
 assert.equal(typeof a.installCallsignRoutes,'function');
 assert.equal(typeof b.initialFixedCallSpecialties,'function');
 const ready=b.initialFixedCallSpecialties({status:'approved',assignedCall:200,
  discordId:id,sync:{call:200,discordId:id}});
 assert.deepEqual(Object.keys(ready),['Radio BM','SIV/WPR']);
 assert.equal(b.initialFixedCallSpecialties({status:'verified',assignedCall:200,
  discordId:id,sync:{call:200,discordId:id}}),null);
});
