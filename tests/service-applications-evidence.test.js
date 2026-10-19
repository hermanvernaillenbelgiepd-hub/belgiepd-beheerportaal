import test from 'node:test';
import assert from 'node:assert/strict';
import {hasTelemetryKey,validatedTelemetryInput,signTrustedTelemetry,
  verifySignedTelemetry,safeCompare} from '../src/service-applications-evidence.js';
const secret='BPD-test-only-telemetry-signing-secret-123456789';
const now=Date.UTC(2026,9,19,12);
const id='123456789012345678';
const source={discordId:id,totalPlaySeconds:36000,
  firstServerJoinAt:new Date(now-6*86400000).toISOString()};
test('No unsigned or user-forged Firestore hours can qualify',()=>{
 assert.equal(verifySignedTelemetry(id,{source:'trusted_fivem_server',
   totalPlaySeconds:36000,firstServerJoinAt:source.firstServerJoinAt,
   verifiedAt:new Date(now).toISOString()},secret,now).eligible,false);
 assert.equal(verifySignedTelemetry(id,null,secret,now).eligible,false);
 assert.equal(verifySignedTelemetry(id,{},'',now).eligible,false);
});
test('A trusted service can supply signed, recent evidence with both thresholds',()=>{
 const input=validatedTelemetryInput(source,now);
 const proof=signTrustedTelemetry(id,input,secret,now);
 assert.equal(verifySignedTelemetry(id,proof,secret,now).eligible,true);
 assert.equal(verifySignedTelemetry('999999999999999999',proof,secret,now).eligible,false);
 assert.equal(verifySignedTelemetry(id,{...proof,totalPlaySeconds:0},secret,now).eligible,false);
 assert.equal(verifySignedTelemetry(id,{...proof,signature:'0'.repeat(64)},secret,now).eligible,false);
 assert.equal(verifySignedTelemetry(id,proof,'wrong-secret',now).eligible,false);
 assert.equal(verifySignedTelemetry(id,proof,secret,now+25*3600000).eligible,false);
 assert.equal(verifySignedTelemetry(id,proof,secret,now+25*3600000).status,'verification_required');
});
test('The FiveM ingestion contract rejects unauthorized or structurally untrusted input',()=>{
 assert.equal(hasTelemetryKey('short'),false);
 assert.equal(hasTelemetryKey(secret),true);
 assert.equal(safeCompare(secret,secret),true);
 assert.equal(safeCompare(secret,'different'),false);
 assert.deepEqual(validatedTelemetryInput(source,now),source);
 for(const bad of [
   {...source,role:'beheerder'},
   {...source,discordId:'fake'},
   {...source,totalPlaySeconds:36000.2},
   {...source,totalPlaySeconds:-1},
   {...source,firstServerJoinAt:new Date(now+1000).toISOString()},
   {...source,firstServerJoinAt:'not-a-date'},
   {...source,source:'trusted_fivem_server'},
   {...source,verifiedAt:new Date(now).toISOString()}
 ])assert.throws(()=>validatedTelemetryInput(bad,now));
});
