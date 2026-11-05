import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 parseActivityTelemetry,previousCompleteMonth,assessActivityPings,
 automaticPingEntryId
} from '../src/activity-ping-policy.js';
import {automaticActivityPingsEnabled} from '../src/activity-ping-runner.js';
import {activityTelemetryEnabled} from '../src/activity-telemetry-routes.js';

const guild='1309532438019706999',id='1309532438019706001';
const at=new Date('2026-11-03T10:20:00.000Z');
const data=(overrides={})=>({
 eventId:'monthly_snapshot_0001',guildId:guild,discordId:id,
 observedAt:at.toISOString(),source:'fivem-activity',
 closedMonth:'2026-10',closedMonthPlaySeconds:15*3600,
 lastConnectedAt:'2026-10-31T10:00:00.000Z',...overrides
});
const evidence=(override={})=>({
 observedAt:at.toISOString(),closedMonth:'2026-10',
 closedMonthPlaySeconds:15*3600,
 lastConnectedAt:'2026-10-31T10:00:00.000Z',...override
});
const membership={joinedAt:'2026-09-01T12:00:00.000Z',leaves:[]};

test('Prior completed calendar month uses Europe/Brussels dates',()=>{
 assert.equal(previousCompleteMonth(at),'2026-10');
 assert.equal(previousCompleteMonth(new Date('2026-01-02T12:00:00Z')),'2025-12');
});
test('Only authenticated, recent, complete monthly activity telemetry is parsed',()=>{
 assert.deepEqual(parseActivityTelemetry(data(),guild,at.getTime()),data());
 for(const changes of [
  {guildId:'000000000000000000'},{discordId:'not-a-member'},
  {source:'client'},{closedMonth:'2026-11'},
  {closedMonthPlaySeconds:-1},{closedMonthPlaySeconds:1.3},
  {observedAt:'2026-10-01T00:00:00Z'},
  {lastConnectedAt:'2026-12-01T00:00:00Z'},
  {lastConnectedAt:'bad'},
  {unexpected:'unknown'}
 ])assert.throws(()=>parseActivityTelemetry(data(changes),guild,at.getTime()));
 assert.equal(parseActivityTelemetry(data({lastConnectedAt:null}),guild,at.getTime()).lastConnectedAt,null);
});
test('Monthly 10/20 thresholds are precise and review-only',()=>{
 const a=assessActivityPings(evidence({closedMonthPlaySeconds:9*3600+3599}),membership,at);
 assert.deepEqual(a.map(x=>[x.criterion,x.kind]),[['monthly','INACTIEF']]);
 const b=assessActivityPings(evidence({closedMonthPlaySeconds:10*3600}),membership,at);
 assert.deepEqual(b.map(x=>[x.criterion,x.kind]),[['monthly','50/50']]);
 assert.deepEqual(assessActivityPings(evidence({closedMonthPlaySeconds:20*3600}),membership,at),[]);
});
test('14 and 30 days produce 50/50 and INACTIEF warnings, never dismissal',()=>{
 const fourteen=new Date(at.getTime()-14*86400000).toISOString();
 const thirty=new Date(at.getTime()-30*86400000).toISOString();
 const first=assessActivityPings(evidence({
  closedMonthPlaySeconds:20*3600,lastConnectedAt:fourteen
 }),membership,at);
 assert.deepEqual(first.map(x=>[x.criterion,x.kind]),[['absence','50/50']]);
 const second=assessActivityPings(evidence({
  closedMonthPlaySeconds:20*3600,lastConnectedAt:thirty
 }),membership,at);
 assert.deepEqual(second.map(x=>[x.criterion,x.kind]),[['absence','INACTIEF']]);
 assert.ok(!second.some(x=>x.kind==='ONTSLAGEN'));
});
test('Approved leave and members without a full month are protected',()=>{
 const onLeave={...membership,leaves:[{status:'approved',startDate:'2026-11-01',endDate:'2026-11-10'}]};
 assert.deepEqual(assessActivityPings(evidence({
  lastConnectedAt:'2026-09-01T00:00:00Z',
  closedMonthPlaySeconds:0
 }),onLeave,at),[]);
 const firstMonth={joinedAt:'2026-10-01T10:00:00Z',leaves:[]};
 assert.deepEqual(assessActivityPings(evidence({closedMonthPlaySeconds:0}),firstMonth,at),[]);
 const monthLeave={...membership,leaves:[{status:'approved',startDate:'2026-10-10',endDate:'2026-10-15'}]};
 assert.deepEqual(assessActivityPings(evidence({closedMonthPlaySeconds:0}),monthLeave,at),[]);
});
test('Unknown or stale FiveM activity never causes an automatic ping',()=>{
 assert.deepEqual(assessActivityPings({},membership,at),[]);
 assert.deepEqual(assessActivityPings(evidence({observedAt:'2026-10-01T12:00:00Z'}),membership,at),[]);
 assert.deepEqual(assessActivityPings(evidence({closedMonthPlaySeconds:20*3600,lastConnectedAt:null}),membership,at),[]);
});
test('Same rule and incident has identical deterministic Firestore entry ID',()=>{
 const ping=assessActivityPings(evidence({closedMonthPlaySeconds:0}),membership,at)[0];
 const one=automaticPingEntryId('politie',id,ping);
 assert.match(one,/^[a-f0-9]{24}$/);
 assert.equal(one,automaticPingEntryId('politie',id,ping));
 assert.notEqual(one,automaticPingEntryId('ambulance',id,ping));
 assert.throws(()=>automaticPingEntryId('burger',id,ping));
});
test('No automatic alerts run without the explicit environment opt-in',()=>{
 assert.equal(automaticActivityPingsEnabled({}),false);
 assert.equal(automaticActivityPingsEnabled({BPD_ENABLE_ACTIVITY_AUTO_PINGS:'true'}),true);
 assert.equal(activityTelemetryEnabled({}),false);
 assert.equal(activityTelemetryEnabled({
  BPD_ENABLE_ACTIVITY_TELEMETRY:'true',
  BPD_CALLSIGN_BOT_WEBHOOK_SECRET:'a'.repeat(32)
 }),true);
 const src=readFileSync(new URL('../src/activity-ping-runner.js',import.meta.url),'utf8');
 assert.match(src,/tx\.create\(entry,/);
 assert.match(src,/tx\.create\(member,/);
 assert.match(src,/tx\.create\(serviceNotice,/);
 assert.match(src,/p\.lifecycleState!=='archived'/);
 assert.doesNotMatch(src,/\barchive\(|\bdismiss\(|personnel_lifecycle\)\.doc/);
});
