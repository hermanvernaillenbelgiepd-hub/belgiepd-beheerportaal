import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTOCrews} from '../public/to-crew-counts.js';

const categories=['SANTO','BLAINE','BWM','AMBULANCE','AMBULANCE-MOTOR','LSRA-F.A.S.T.'];
const crew=(id,number,extra={})=>({id,dienst:'SANTO',roepnaam:number,leden:[{naam:'Testagent',roep:number}],available:true,...extra});
const radio=(category,number,extra={})=>({category,number,importable:true,...extra});
const count=(board,users=[],fresh=true)=>summarizeTOCrews(board,{categories,users,fresh});

test('Fresh radio crews automatically count alongside saved crews without importing them',()=>{
  const board={ploegen:{saved:crew('saved','620')},meldingen:{}};
  assert.deepEqual(count(board,[radio('SANTO','620'),radio('AMBULANCE-MOTOR','700')]),{
    inService:2,available:2,unavailable:0,boardTeams:1,radioOnly:1,radioLinked:1,paired:0,activeIncidents:0
  });
  assert.deepEqual(count(undefined,[radio('AMBULANCE','800')]),{
    inService:1,available:1,unavailable:0,boardTeams:0,radioOnly:1,radioLinked:0,paired:0,activeIncidents:0
  },'Radio totals do not require a saved TO session');
});

test('Both member radios of a koppel remain one saved crew, including leading zeros',()=>{
  const team=crew('pair','900',{koppel:true,leden:[{naam:'Test A',roep:'620'},{naam:'Test B',roep:'900'}]});
  assert.deepEqual(count({ploegen:[team]},[radio('SANTO','00620'),radio('SANTO','00900'),radio('SANTO','620')]),{
    inService:1,available:1,unavailable:0,boardTeams:1,radioOnly:0,radioLinked:1,paired:1,activeIncidents:0
  });
});

test('Duplicate radio labels count once while complete category names remain distinct',()=>{
  const result=count({},[
    radio('SANTO','620',{importable:false}),radio('SANTO','00620',{importable:false}),
    radio('BLAINE','620'),radio('AMBULANCE','620'),radio('AMBULANCE-MOTOR','620'),
    radio('LSRA-F.A.S.T.','620'),radio('LSRA-F.A.S.T.','00620')
  ]);
  assert.equal(result.inService,5);
  assert.equal(result.radioOnly,5);
  assert.equal(result.available,5);
});

test('Only recognizable category and positive one-to-five digit callsigns add radio crews',()=>{
  const invalid=[radio('UNKNOWN','620'),radio('AMBULANCE-MOTOR',null),radio('SANTO','0'),
    radio('SANTO','00000'),radio('SANTO','123456'),radio('SANTO','A620'),radio('SANTO','620 '),
    radio('santo','620'),radio('LSRA-FxAxSxTx','620'),null,{},radio('SANTO',true)];
  assert.equal(count({},invalid).inService,0);
  assert.equal(count({},[...invalid,radio('AMBULANCE-MOTOR','00001')]).inService,1);
});

test('Saved pauses and active incident assignments override online radio availability',()=>{
  const board={ploegen:{paused:crew('paused','620',{available:false}),busy:crew('busy','621'),free:crew('free','622')},
    meldingen:{active:{status:'actief',ploegen:[{id:'busy'},{id:'busy'}]},closed:{status:'niet-actief',ploegen:[{id:'free'}]}}};
  assert.deepEqual(count(board,[radio('SANTO','620'),radio('SANTO','621'),radio('SANTO','622'),radio('SANTO','623')]),{
    inService:4,available:2,unavailable:2,boardTeams:3,radioOnly:1,radioLinked:3,paired:0,activeIncidents:1
  });
});

test('BWM radio crews share saved status while identical police callsigns count separately',()=>{
  const board={ploegen:[crew('fire-paused','620',{dienst:'BWM',available:false}),
    crew('fire-busy','621',{dienst:'BWM'})],
    meldingen:[{status:'actief',ploegen:[{id:'fire-busy'}]}]};
  const users=[radio('BWM','00620'),radio('BWM','621'),radio('BWM','622'),
    radio('BWM','00622'),radio('SANTO','620')];
  assert.deepEqual(count(board,users),{
    inService:4,available:2,unavailable:2,boardTeams:2,radioOnly:2,radioLinked:2,paired:0,activeIncidents:1
  });
  assert.deepEqual(count(board,users,false),{
    inService:2,available:0,unavailable:2,boardTeams:2,radioOnly:0,radioLinked:0,paired:0,activeIncidents:1
  });
});

test('Ending a crew suppresses its online callsign and all paired member callsigns',()=>{
  const ended=crew('ended','900',{endedAt:10,available:false,koppel:true,leden:[{roep:'620'},{roep:'900'}]});
  const result=count({ploegen:[ended]},[radio('SANTO','00620'),radio('SANTO','900'),radio('SANTO','901')]);
  assert.equal(result.inService,1);
  assert.equal(result.available,1);
  assert.equal(result.boardTeams,0);
  assert.equal(result.radioOnly,1);
});

test('An active saved crew reusing an ended callsign takes precedence over the ended record',()=>{
  const board={ploegen:[crew('old','620',{endedAt:10}),crew('new','00620',{available:false})]};
  const result=count(board,[radio('SANTO','620')]);
  assert.equal(result.inService,1);
  assert.equal(result.radioLinked,1);
  assert.equal(result.radioOnly,0);
  assert.equal(result.available,0);
});

test('Stale or empty radio results preserve saved crew totals and availability',()=>{
  const board={ploegen:[crew('free','620'),crew('paused','621',{available:false})]};
  for(const result of [count(board,[radio('SANTO','700')],false),count(board,[])]){
    assert.deepEqual(result,{inService:2,available:1,unavailable:1,boardTeams:2,radioOnly:0,
      radioLinked:0,paired:0,activeIncidents:0});
  }
  assert.equal(summarizeTOCrews(board,{categories,users:[radio('SANTO','700')]}).inService,2,
    'Freshness must be opted into explicitly');
});

test('Counting never modifies the saved board or radio snapshot',()=>{
  const board={session:{ownerUid:'test-owner'},ploegen:{team:crew('team','620')},meldingen:{}};
  const options={categories,users:[radio('SANTO','00620'),radio('AMBULANCE','700',{importable:false})],fresh:true};
  const before=structuredClone({board,options});
  summarizeTOCrews(board,options);
  assert.deepEqual({board,options},before);
});
