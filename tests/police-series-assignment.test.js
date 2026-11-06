import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {policeSeriesNumber,isFixedPoliceAgent,firstBalancedPoliceSeries,
 seriesCounts,overlayPoliceSeriesAssignments,needsPoliceSeriesAssignment,
 validatePoliceSeriesChange} from '../src/police-series-policy.js';
import {automaticPoliceSpecialties,INITIAL_POLICE_SPECIALTIES,
 publicSpecializations} from '../src/specialization-policy.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id=(n)=>String(123456789012345000n+BigInt(n));
const person=(n,series,call=200)=>({dept:'politie',personId:id(n),call:String(call),
 series:series===null?'Instroom':'Reeks '+series,
 seriesRaw:series===null?'':String(series),rank:'Agent',status:'Actief'});

test('First available R1, R2, R3 balances current Police roster, deterministic ties',()=>{
 const roster=[person(1,1),person(2,1),person(3,2),person(4,3)];
 assert.deepEqual(seriesCounts(roster),{1:2,2:1,3:1});
 assert.equal(firstBalancedPoliceSeries(roster),2);
 assert.equal(firstBalancedPoliceSeries([person(1,1),person(3,2),person(4,3)]),1);
 assert.equal(firstBalancedPoliceSeries([person(1,1),person(2,1),person(3,2)]),3);
 assert.equal(firstBalancedPoliceSeries([...roster,person(5,2)]),3);
 assert.equal(firstBalancedPoliceSeries([...roster,person(5,3)]),2);
});
test('Series overlays do not change ranks or Discord privileges; official membership retained',()=>{
 const before=[person(1,null),person(2,2),{dept:'ambulance',personId:id(3),series:'Reeks 2'}];
 const assigned={dept:'politie',discordId:id(1),series:1,revision:4};
 const viewed=overlayPoliceSeriesAssignments(before,[assigned]);
 assert.equal(viewed[0].series,'Reeks 1');
 assert.equal(viewed[0].policeSeriesRevision,4);
 assert.equal(viewed[1].series,'Reeks 2');
 assert.equal(viewed[2],before[2]);
 assert.equal(before[0].series,'Instroom');
 assert.equal(Object.hasOwn(viewed[0],'role'),false);
});
test('Only linked fixed 2xx Police numbers obtain series, never 100 temp or 9xx',()=>{
 const fixed=person(1,null,210),temp=person(1,null,150),officer=person(1,null,930);
 assert.equal(isFixedPoliceAgent(fixed),true);
 assert.equal(isFixedPoliceAgent(person(1,null,315)),true);
 assert.equal(needsPoliceSeriesAssignment(person(1,null,315)),true);
 assert.equal(isFixedPoliceAgent(person(1,null,730)),true);
 assert.equal(needsPoliceSeriesAssignment(fixed),true);
 assert.equal(needsPoliceSeriesAssignment(fixed,[{dept:'politie',discordId:fixed.personId,series:2}]),false);
 assert.equal(needsPoliceSeriesAssignment(person(1,3,225)),false);
 assert.equal(needsPoliceSeriesAssignment(temp),false);
 assert.equal(needsPoliceSeriesAssignment(officer),false);
 const route=src('src/personnel-editor-routes.js');
 assert.match(route,/const wantsFixedDefaults=proposed\.dept==='politie'/);
 assert.match(route,/const linkedFixed=record\.dept==='politie'/);
 assert.match(route,/\[2-8\]/);
 assert.doesNotMatch(route,/\/\^2\\\\d\\\\d\$\//);
 assert.equal(policeSeriesNumber('Reeks 1'),1);
 assert.equal(policeSeriesNumber('R02'),2);
 assert.equal(policeSeriesNumber('3'),3);
 assert.equal(policeSeriesNumber('KADER'),null);
});
test('Manual series change requires expected revision, motivation and valid series',()=>{
 assert.deepEqual(validatePoliceSeriesChange({series:2,reason:'Evenwichtige herverdeling van de personeelsreeks',expectedRevision:0}),
  {series:2,reason:'Evenwichtige herverdeling van de personeelsreeks',expectedRevision:0});
 for(const bad of [
  {series:4,reason:'Motivering van deze wijziging',expectedRevision:0},
  {series:1,reason:'te kort',expectedRevision:0},
  {series:1,reason:'Motivering van deze wijziging',expectedRevision:-1},
  {series:1,reason:'Motivering van deze wijziging',expectedRevision:0,role:'korpsleiding'}])
  assert.throws(()=>validatePoliceSeriesChange(bad));
});
test('Fixed call projects interventie radioBM and SIV/WPR into dossier and roster',()=>{
 const p={dept:'politie',call:'210',personId:id(2),specialties:[]};
 const automatic=automaticPoliceSpecialties(p);
 for(const label of ['INTERVENTIEDIENST','Radio BM','SIV/WPR'])
  assert.equal(automatic[label],'Ja');
 assert.ok(INITIAL_POLICE_SPECIALTIES.includes('INTERVENTIEDIENST'));
 const state=publicSpecializations(p,{values:{'Radio BM':{value:'Nee',source:'manual'}}});
 assert.equal(state.items.find(x=>x.label==='Radio BM').value,'Nee');
 assert.equal(state.items.find(x=>x.label==='SIV/WPR').value,'Ja');
 assert.equal(state.items.find(x=>x.label==='INTERVENTIEDIENST').value,'Ja');
 const temp=publicSpecializations({...p,call:'110'},{});
 assert.equal(temp.items.find(x=>x.label==='INTERVENTIEDIENST').value,'Niet ingevuld');
});
test('Both fixed-call flows persist series; cadre can manually switch with history',()=>{
 const call=src('src/callsign-routes.js');
 const route=src('src/personnel-editor-routes.js');
 const server=src('src/server.js');
 const page=src('public/personeelsbeheer.html');
 assert.match(call,/ensurePoliceSeries\(subject,roster\.data/);
 assert.match(route,/reservePoliceSeriesWithinTransaction\(tx,store,snap\.data/);
 assert.match(route,/app\.post\('\/api\/personnel\/politie\/:discordId\/series'/);
 assert.match(route,/canEditSeries\(req\.bpd,staff\)/);
 assert.match(route,/tx\.create\(ref\.collection\('audit'\)\.doc\(\)/);
 assert.match(route,/action:'initial_fixed_callsign_specialty'/);
 assert.match(server,/overlayPoliceSeriesAssignments\(edited,policeSeries\)/);
 assert.match(page,/id="policeSeriesPanel"/);
 assert.match(page,/id="policeSeriesReason"/);
 assert.match(page,/id="policeSeriesForm"/);
 assert.match(page,/p\.canChangeSeries===true/);
});
