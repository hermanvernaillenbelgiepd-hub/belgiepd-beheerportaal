import test from 'node:test';
import assert from 'node:assert/strict';
import {observeRadioDepartures,radioMatchesSavedTeam,RADIO_AUTO_END_GRACE_MS} from '../src/to-radio-auto-end.js';

const base=Date.UTC(2026,9,21,10,0,0);
const crew=(id,number,extra={})=>({id,dienst:'SANTO',roepnaam:String(number),
  leden:[{naam:'Agent',roep:String(number)}],available:true,...extra});
const board=(teams,linked=[])=>({session:{id:'12345678-1234-4123-8123-123456789012'},
  ploegen:Object.fromEntries(teams.map(team=>[team.id,team])),
  meldingen:linked.length?{call:{status:'actief',ploegen:linked.map(id=>({id}))}}:{}});
const snapshot=(timestamp,users=[],extra={})=>({configured:true,connected:true,stale:false,
  fetchedAt:new Date(timestamp).toISOString(),users,uncertainUnits:[],...extra});
const present=(number,category='SANTO')=>({category,number:String(number)});
const poll=(tracker,roster,start=base,users=[],extra={})=>{
  const snapshots=[0,15000,30000,45000,60000,75000,90000,105000,120000,135000];
  return snapshots.map(delay=>observeRadioDepartures(roster,snapshot(start+delay,users,extra),tracker,start+delay));
};

test('Two minutes and multiple distinct healthy upstream reads precede auto retirement',()=>{
  const roster=board([crew('a','166'),crew('b','465')]);
  const tracker=new Map();
  const results=poll(tracker,roster);
  assert.ok(results.slice(0,-2).every(ids=>ids.length===0));
  assert.deepEqual(results[8].sort(),['a','b']);
  assert.deepEqual(results[9].sort(),['a','b']);
});

test('Any current radio member preserves a paired crew, including zero padded numbers',()=>{
  const team=crew('paired','600',{koppel:true,
    leden:[{naam:'A',roep:'600'},{naam:'B',roep:'900'}]});
  assert.equal(radioMatchesSavedTeam(team,[present('00900')]),true);
  assert.equal(radioMatchesSavedTeam(team,[present('600','BWM')]),false);
  const tracker=new Map(),roster=board([team,crew('other','166')]);
  poll(tracker,roster,base,[present('00900')]);
  assert.equal(tracker.has('paired'),false);
  assert.deepEqual(observeRadioDepartures(roster,snapshot(base+150000,[present('00900')]),tracker,base+150000),['other']);
});

test('One return to channel resets missing duration and delays automatic retirement',()=>{
  const tracker=new Map(),roster=board([crew('a','166')]);
  observeRadioDepartures(roster,snapshot(base),tracker,base);
  observeRadioDepartures(roster,snapshot(base+30000),tracker,base+30000);
  assert.equal(tracker.get('a').polls,2);
  observeRadioDepartures(roster,snapshot(base+45000,[present('166')]),tracker,base+45000);
  assert.equal(tracker.has('a'),false);
  assert.deepEqual(observeRadioDepartures(roster,snapshot(base+120000),tracker,base+120000),[]);
  assert.equal(tracker.get('a').polls,1);
});

test('Offline and stale data never count as absence, and duplicate cached reads do not advance polls',()=>{
  const tracker=new Map(),roster=board([crew('a','166')]);
  observeRadioDepartures(roster,snapshot(base),tracker,base);
  observeRadioDepartures(roster,snapshot(base),tracker,base+1000);
  assert.equal(tracker.get('a').polls,1);
  for(const extra of [{connected:false},{stale:true},{configured:false},{uncertainUnits:null}])
    assert.deepEqual(observeRadioDepartures(roster,snapshot(base+15000,[],extra),tracker,base+15000),[]);
  assert.equal(tracker.has('a'),false);
  assert.deepEqual(observeRadioDepartures(roster,snapshot(base+120000),tracker,base+120000),[]);
});

test('Unknown radio channel metadata protects only the matching rostered callsign',()=>{
  const tracker=new Map(),roster=board([crew('a','166'),crew('b','465')]);
  const results=poll(tracker,roster,base,[],{channelStatusUnknown:1,uncertainUnits:[present('166')]});
  assert.deepEqual(results[8],['b']);
  assert.equal(tracker.has('a'),false);
});

test('Assigned units are preserved; manual and ended teams are not offered for removal',()=>{
  const tracker=new Map(),roster=board([crew('busy','930'),crew('free','166'),crew('ended','465',{endedAt:base-10})],['busy']);
  assert.deepEqual(poll(tracker,roster)[8],['free']);
  roster.meldingen.call.ploegen=[];
  assert.deepEqual(observeRadioDepartures(roster,snapshot(base+150000),tracker,base+150000).sort(),['busy','free']);
});

test('New service sessions and deleted roster entries discard old departure timers',()=>{
  const tracker=new Map(),old=board([crew('a','166')]);
  poll(tracker,old);
  const next=board([crew('a','166')]);
  next.session.id='12345678-1234-4123-8123-123456789099';
  assert.deepEqual(observeRadioDepartures(next,snapshot(base+150000),tracker,base+150000),[]);
  assert.equal(tracker.get('a').polls,1);
  next.ploegen={};
  observeRadioDepartures(next,snapshot(base+165000),tracker,base+165000);
  assert.equal(tracker.has('a'),false);
});
