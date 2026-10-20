import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radioMarkedUnavailable,stripRadioNBMarkers,radioMarkedPair,
  groupRadioCrews,radioNBForTeam} from '../public/to-radio-availability.js';
import {parseSonoranName,createSonoranRadioService} from '../src/to-radio.js';

test('NB and (NB) are position-independent and case-insensitive, never parts of words',()=>{
  const available=['SANTO-600','SANTO-600*','HAMB620','SANTO-600 NBX','BNB-600','SANTO-600 | BANBURY'];
  for(const label of available)assert.equal(radioMarkedUnavailable(label),false,label);
  for(const label of ['NB SANTO-600','(NB) SANTO-600*','SANTO-600 NB',
    'SANTO-600(NB)','SANTO-600* (NB)','SANTO-600 | Agent NB',
    'BWM-620 nb','HARTS12 ( nb )']){
    assert.equal(radioMarkedUnavailable(label),true,label);
  }
  assert.equal(stripRadioNBMarkers('(NB) SANTO-600* NB'),'SANTO-600*');
  assert.equal(stripRadioNBMarkers('HAMB-120 (NB)'),'HAMB-120');
});

test('Valid numbered * callsigns are parsed without confusing team IDs or medical codes',()=>{
  for(const name of ['SANTO-600*','SANTO - 00600* (NB)','NB SANTO-600*',
    'HAMB 620*','AMB620*','LSRA-F.A.S.T.-100*']){
    const parsed=parseSonoranName(name+' | Test Medewerker');
    assert.equal(parsed.importable,true,name);
    assert.match(parsed.number,/^\d{1,5}$/);
    assert.equal(radioMarkedPair(name),true,name);
  }
  assert.equal(parseSonoranName('SANTO-600**').importable,false);
  assert.equal(radioMarkedPair('SANTO-600'),false);
  assert.equal(radioMarkedPair('SANTO-600 | Agent *'),false);
  assert.equal(radioMarkedPair('NB SANTO-600*'),true);
  assert.equal(parseSonoranName('SANTO-600* (NB)').number,'600');
});

test('Same-category starred radios appear as one crew; unrelated callsigns stay separate',()=>{
  const users=[
    {category:'SANTO',number:'600',paired:true,notAvailable:false,name:'SANTO-600* | A'},
    {category:'SANTO',number:'00600',paired:true,notAvailable:true,name:'SANTO-00600* NB | B'},
    {category:'BLAINE',number:'600',paired:true,notAvailable:false,name:'BLAINE-600*'},
    {category:'SANTO',number:'601',paired:false,notAvailable:false,name:'SANTO-601'},
    {category:'SANTO',number:'602',paired:false,notAvailable:false,name:'SANTO-602'}
  ];
  const snapshot=structuredClone(users),groups=groupRadioCrews(users);
  assert.equal(groups.length,4);
  assert.equal(groups[0].members.length,2);
  assert.equal(groups[0].paired,true);
  assert.equal(groups[0].radioUnavailable,true);
  assert.equal(groups[1].category,'BLAINE');
  assert.deepEqual(users,snapshot);
  assert.equal(radioNBForTeam({dienst:'SANTO',roepnaam:'600',leden:[]},users),true);
  assert.equal(radioNBForTeam({dienst:'BLAINE',roepnaam:'600',leden:[]},users),false);
  assert.equal(radioNBForTeam({dienst:'SANTO',roepnaam:'600',leden:[]},users.slice(0,1)),false);
});

test('Starred duplicate members keep their radio identity but form one operational koppel',async()=>{
  const service=createSonoranRadioService({
    env:{SONORAN_RADIO_API_KEY:'test-secret',SONORAN_RADIO_COMMUNITY_ID:'test-community'},
    fetchImpl:async()=>new Response(JSON.stringify({connectedUsers:[
      {identity:'private-a',name:'SANTO-600* | Agent A',roomId:1},
      {identity:'private-b',name:'SANTO-00600* (NB) | Agent B',roomId:2},
      {identity:'private-c',name:'BWM-600 | Brandweer',roomId:3}
    ]}),{status:200,headers:{'content-type':'application/json'}})
  });
  const payload=await service.read();
  assert.equal(payload.connected,true);
  assert.equal(payload.users.length,3);
  assert.equal(payload.users[0].paired,true);
  assert.equal(payload.users[1].notAvailable,true);
  assert.equal(payload.users[2].paired,false);
  assert.equal(payload.users[0].importable,true);
  assert.equal(payload.users[1].importable,true);
  assert.equal(groupRadioCrews(payload.users).length,2);
  assert.equal(JSON.stringify(payload).includes('private-a'),false);
  assert.equal(JSON.stringify(payload).includes('test-secret'),false);
});

test('TO client shows one combined pair, NB status and protects radio-unavailable toggles',()=>{
  const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');
  assert.ok(js.includes('groupRadioCrews(allUsers)'));
  assert.ok(js.includes('groupByTOService(displayedCrews,crew=>crew.category)'));
  assert.ok(js.includes('👥'));
  assert.ok(js.includes('crew.radioUnavailable'));
  assert.ok(js.includes("pill('Niet beschikbaar · NB','red')"));
  assert.ok(js.includes("const nbOnRadio=fresh&&radioNBForTeam(team,radioMembers)"));
  assert.ok(js.includes('data-fixed-disabled="true"'));
  assert.ok(js.includes("nbOnRadio?'NB via radio'"));
  assert.ok(css.includes('.radio-crew-paired'));
  assert.ok(css.includes('.radio-crew-nb'));
});
