import test from 'node:test';
import assert from 'node:assert/strict';
import {createSonoranRadioService,parseSonoranName,activeSonoranChannels} from '../src/to-radio.js';

const apiKey='test-only-sonoran-secret-do-not-export';
const communityId='00000000-0000-4000-8000-000000000001';
const configuredEnv={SONORAN_RADIO_API_KEY:apiKey,SONORAN_RADIO_COMMUNITY_ID:communityId};
const startTime=Date.UTC(2026,9,20,14,0);
// Existing fixtures represent users tuned to radio channels by default.
// Tests for logged-in clients with NO channel supply explicit metadata.
const reply=(users,options={})=>new Response(JSON.stringify({connectedUsers:users.map(user=>
  user&&typeof user==='object'&&!Array.isArray(user)&&!Object.hasOwn(user,'metadata')
    ?{...user,metadata:{state:{primaryChId:19,scannedChIds:[]}}}:user
)}),{status:200,headers:{'content-type':'application/json'},...options});
const validUser={identity:'private-identity-one',name:'SANTO - 620 | Agent Test',roomId:1};

test('Only real transmit/scan channel assignments qualify; roomId is a server room, not a channel',()=>{
  assert.deepEqual(activeSonoranChannels({state:{primaryChId:19,scannedChIds:[175,176,19,0]}}),['19','175','176']);
  assert.deepEqual(activeSonoranChannels({state:{primaryChId:0,scannedChIds:[215]}}),['215']);
  for(const metadata of [
    null,undefined,{}, {state:null}, {state:{}},
    {state:{primaryChId:0,scannedChIds:[]}},
    {state:{primaryChId:null,scanLists:[{channelIds:[19]}]}},
    {state:{primaryChId:-1,scannedChIds:[0,-2,null,'19']}}
  ])assert.deepEqual(activeSonoranChannels(metadata),[]);
  assert.deepEqual(activeSonoranChannels({state:{primaryChId:0,primaryChIds:[90,91]}}),['90','91']);
  // Radio API v2 encodes metadata as a JSON STRING (not a nested object).
  assert.deepEqual(activeSonoranChannels(JSON.stringify({
    sonrad:true,state:{primaryChId:19,scannedChIds:[175,176]}
  })),['19','175','176']);
  assert.deepEqual(activeSonoranChannels(JSON.stringify({
    sonrad:true,state:{primaryChId:'31',scannedChIds:['32','33']}
  })),['31','32','33']);
  assert.deepEqual(activeSonoranChannels('{"sonrad":true}'),[]);
  assert.deepEqual(activeSonoranChannels('invalid json }'),[]);
  assert.deepEqual(activeSonoranChannels('{"sonrad":true,"state":'+ 'x'.repeat(9000)),[]);

});

test('Logged-in Sonoran users without an actual radio channel are excluded from operational crews',async()=>{
  const users=[
    {identity:'tuned-primary',name:'SANTO-600 | One',roomId:1,
      metadata:{state:{primaryChId:42,scannedChIds:[]}}},
    {identity:'tuned-scan',name:'BWM-301 | Two',roomId:1,
      metadata:{state:{primaryChId:0,scannedChIds:[81]}}},
    {identity:'lobby-only',name:'SANTO-601 | No Channel',roomId:1,metadata:{state:{primaryChId:0,scannedChIds:[]}}},
    {identity:'room-only',name:'BWM-302 | No Metadata',roomId:1,metadata:null},
    {identity:'preset-only',name:'ZW-1 | No Actual Scan',roomId:1,
      metadata:{state:{primaryChId:0,scanLists:[{channelIds:[55]}]}}},
    {identity:'zero-room',name:'SANTO-602 | Transmit',roomId:0,
      metadata:{state:{primaryChId:34,scannedChIds:[]}}},
    {identity:'v2-string-primary',name:'SANTO-930 | Hubert',roomId:1,
      metadata:JSON.stringify({sonrad:true,state:{primaryChId:30,scannedChIds:[]}})},
    {identity:'v2-string-scanned',name:'SANTO-166 | Yassin',roomId:1,
      metadata:JSON.stringify({sonrad:true,state:{primaryChId:0,scannedChIds:[90]}})},
    {identity:'v2-string-lobby',name:'SANTO-777 | Just Logged In',roomId:1,
      metadata:JSON.stringify({sonrad:true,state:{primaryChId:0,scannedChIds:[]}})},
    {identity:'v2-string-no-status',name:'SANTO-888 | Missing State',roomId:1,
      metadata:'{"sonrad":true}'}
  ];
  const radio=createSonoranRadioService({env:configuredEnv,fetchImpl:async()=>reply(users)});
  const result=await radio.read();
  assert.equal(result.connected,true);
  assert.equal(result.connectedCount,10);
  assert.equal(result.channelStatusUnknown,2);
  assert.equal(result.notInChannel,3);
  assert.deepEqual(result.users.map(u=>[u.category,u.number,u.channel]),[
    ['SANTO','600','42'],['BWM','301','81'],['SANTO','602','34'],
    ['SANTO','930','30'],['SANTO','166','90']
  ]);
  assert.deepEqual(result.counts,{online:5,recognized:5});
  assert.equal(JSON.stringify(result).includes('tuned-primary'),false);
  assert.equal(result.users.every(u=>!Object.hasOwn(u,'metadata')&&u.channel!==null),true);
  assert.equal(JSON.stringify(result).includes('v2-string-primary'),false);
  assert.equal(JSON.stringify(result).includes('v2-string-scanned'),false);

});

test('Sonoran access and rate-limit failures provide safe actionable messages',async()=>{
  for(const [status,pattern] of [[401,/Community ID en API Key/],[403,/Community ID en API Key/],[429,/te veel aanvragen/]]){
    const service=createSonoranRadioService({env:configuredEnv,fetchImpl:async()=>new Response('Private diagnostic '+apiKey,{status})});
    const result=await service.read();
    assert.equal(result.connected,false);assert.match(result.message,pattern);
    assert.equal(JSON.stringify(result).includes(apiKey),false);
    assert.equal(JSON.stringify(result).includes('Private diagnostic'),false);
  }
});
function assertPrivate(value){
  const json=JSON.stringify(value);
  assert.equal(json.includes(apiKey),false,'The server API key must never enter the client response');
  assert.equal(json.includes('private-identity'),false,'Raw upstream identity values must not enter the client response');
}

test('Missing Sonoran configuration produces an explicit unconfigured response without an upstream request',async()=>{
  for(const env of [{},{SONORAN_RADIO_API_KEY:apiKey},{SONORAN_RADIO_COMMUNITY_ID:communityId}]){
    let calls=0;
    const service=createSonoranRadioService({env,now:()=>startTime,fetchImpl:async()=>{calls++;throw Error('Must not be called');}});
    const result=await service.read();
    assert.equal(result.configured,false);
    assert.equal(result.connected,false);
    assert.deepEqual(result.users,[]);
    assert.equal(calls,0);
    assertPrivate(result);
  }
});

test('Sonoran requests use a fixed HTTPS destination, server Bearer authentication, and refuse redirects',async()=>{
  const calls=[];
  const service=createSonoranRadioService({env:configuredEnv,now:()=>startTime,fetchImpl:async(url,options)=>{calls.push({url,options});return reply([validUser]);}});
  const result=await service.read();
  assert.equal(calls.length,1);
  const url=new URL(calls[0].url);
  assert.equal(url.origin,'https://api.sonoranradio.com');
  assert.equal(url.pathname,'/v2/servers/'+communityId+'/connected-users');
  assert.equal(calls[0].options.method||'GET','GET');
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(new Headers(calls[0].options.headers).get('Authorization'),'Bearer '+apiKey);
  assert.equal(url.search,'');
  assert.equal(result.configured,true);
  assert.equal(result.connected,true);
  assert.equal(result.stale,false);
  assert.equal(result.users.length,1);
  assertPrivate(result);
});

test('Radio labels are importable only for known patrol categories and positive numeric callsigns',()=>{
  assert.deepEqual(parseSonoranName(' santo - 00620 | Agent Test '),{category:'SANTO',number:'00620',displayName:'Agent Test',importable:true});
  assert.deepEqual(parseSonoranName('BLAINE-28'),{category:'BLAINE',number:'28',displayName:null,importable:true});
  for(const value of [null,{},'Een gebruiker zonder roepnummer','UNKNOWN - 620 | Agent','SANTO - 0 | Agent','SANTO - 00000 | Agent','SANTO - 123456 | Agent','SANTO - A620 | Agent']){
    assert.equal(parseSonoranName(value).importable,false);
  }
});

test('BWM is a distinct recognized fire callsign without accepting similar unknown labels',()=>{
  for(const label of ['BWM - 620 | Testbrandweerman','bwm-620 | Testbrandweerman','BWM-00620 | Testbrandweerman']){
    const parsed=parseSonoranName(label);
    assert.equal(parsed.category,'BWM');
    assert.equal(Number(parsed.number),620);
    assert.equal(parsed.displayName,'Testbrandweerman');
    assert.equal(parsed.importable,true);
  }
  assert.deepEqual(parseSonoranName('BWM | Testbrandweerman'),
    {category:'BWM',number:null,displayName:'Testbrandweerman',importable:false});
  for(const label of ['BWMW - 620 | Test','BWM-EXTRA - 620 | Test','BWMOTOR - 620 | Test']){
    assert.equal(parseSonoranName(label).importable,false,label);
  }
});

test('Brandweer and Depannage prefixes resolve in Sonoran without changing police or ambulance calls',()=>{
  for(const category of ['BWM','BWV','BAMBU','BWAMBU','BW-AMBU','KORP','SERG','ADJ','LT','KAP','MAJ','KOL','ZONE','LSRA','DEPK']){
    for(const sep of ['','-',' - ',' ']){
      const value=category+sep+'620* (NB) | Medewerker';
      const parsed=parseSonoranName(value);
      assert.equal(parsed.category,category,value);
      assert.equal(parsed.number,'620',value);
      assert.equal(parsed.importable,true,value);
    }
  }
  for(const raw of ['LSRA-PECHHULP','LSRAFAST','DEPKTAKEL']){
    const parsed=parseSonoranName(raw+' | Chauffeur');
    assert.equal(parsed.category,raw.startsWith('LSRA')?'LSRA':'DEPK',raw);
    assert.equal(parsed.importable,false,raw);
    assert.equal(parsed.number,null,raw);
  }
  for(const callsign of ['DEPKTAKEL-620','LSRASPECIAL-007']){
    const parsed=parseSonoranName(callsign+' | Chauffeur');
    assert.equal(parsed.category,callsign.startsWith('LSRA')?'LSRA':'DEPK');
    assert.equal(parsed.importable,false,'Unlisted specialist labels must not be auto-imported');
  }
  assert.equal(parseSonoranName('ZONE-COMM - 620').category,'ZONE-COMM');
  assert.equal(parseSonoranName('LSRA-F.A.S.T. - 620').category,'LSRA-F.A.S.T.');
  for(const invalid of ['BWMW-620','BWM-EXTRA-620','KAPITEIN-620','ZONERAND-620'])
    assert.equal(parseSonoranName(invalid).importable,false,invalid);
});

test('STAG belongs to fire, STAGE to ambulance, CANINE to police across callsign formats',()=>{
  for(const [category,number] of [['STAG','120'],['STAGE','620'],['CANINE','77'],['ZW','1']]){
    for(const separator of ['','-',' - ',' ']){
      const parsed=parseSonoranName(category+separator+number+'* (NB) | Collega');
      assert.deepEqual(parsed,{category,number,displayName:'Collega',importable:true},category+separator+number);
    }
    assert.deepEqual(parseSonoranName(category+' | Collega'),{
      category,number:null,displayName:'Collega',importable:false
    });
  }
  assert.equal(parseSonoranName('STAGE-620').category,'STAGE');
  assert.equal(parseSonoranName('STAG-620').category,'STAG');
  for(const name of ['STAGER-620','STAGE-123456','STAGX-620','CANINE-ABC'])
    assert.equal(parseSonoranName(name).importable,false,name);
});

test('Matching BWM and police numbers remain separate importable radio crews',async()=>{
  const service=createSonoranRadioService({env:configuredEnv,fetchImpl:async()=>reply([
    {identity:'private-identity-police',name:'SANTO - 620 | Testagent'},
    {identity:'private-identity-fire',name:'BWM - 00620 | Testbrandweerman'}
  ])});
  const result=await service.read();
  assert.equal(result.connected,true);
  assert.deepEqual(result.users.map(user=>[user.category,user.number,user.importable]),
    [['SANTO','620',true],['BWM','00620',true]]);
  assert.deepEqual(result.counts,{online:2,recognized:2});
  assertPrivate(result);
});

test('All requested emergency and recovery categories retain their complete radio label',()=>{
  const categories=['AMBULANCE','AMBULANCE-MOTOR','PIT','MUG','MUGHELI','DIR-MED','SIT-TEAM','BRANDWEER','ZONE-COMM','PLOEG1','PLOEG2','PLOEG3','LSRA-DEPA100','LSRA-DEPAK200','LSRA-F.A.S.T.','LSRA-ANWV'];
  for(const category of categories){
    for(const separator of [' - ','-']){
      assert.deepEqual(parseSonoranName(category.toLowerCase()+separator+'00620 | Hulpverlener Test'),
        {category,number:'00620',displayName:'Hulpverlener Test',importable:true},category);
    }
    assert.deepEqual(parseSonoranName(category+' | Hulpverlener Test'),
      {category,number:null,displayName:'Hulpverlener Test',importable:false},'Standalone labels must not invent a callsign');
  }
  assert.equal(parseSonoranName('AMBULANCE-MOTOROLA - 620 | Test').importable,false);
  assert.equal(parseSonoranName('LSRA-FxAxSxTx - 100 | Test').importable,false);
});

test('Medical unit types and numeric callsigns appear under Ambulancedienst',()=>{
  const categories=['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB'];
  for(const category of categories){
    for(const [separator,number] of [['-', '123'],[' ', '007'],['','25'],[' - ','42']]){
      const label=category+separator+number+' | Medewerker Test';
      assert.deepEqual(parseSonoranName(label),
        {category,number,displayName:'Medewerker Test',importable:true},label);
    }
    const solo=parseSonoranName(category+' | Medewerker Test');
    assert.equal(solo.category,category);
    assert.equal(solo.importable,false);
    assert.equal(solo.number,null);
    assert.equal(parseSonoranName(category+'0').importable,false);
    assert.equal(parseSonoranName(category+'123456').importable,false);
  }
  assert.equal(parseSonoranName('AMBULANCE-MOTOR - 99').category,'AMBULANCE-MOTOR');
  assert.equal(parseSonoranName('HAMBULANCE - 99').importable,false);
  assert.equal(parseSonoranName('AMBX99').importable,false);
  assert.equal(parseSonoranName('ARTS - ADMIN').importable,false);
});

test('Compound categories remain distinct when numeric callsigns match',async()=>{
  const service=createSonoranRadioService({env:configuredEnv,fetchImpl:async()=>reply([
    {identity:'ambulance',name:'AMBULANCE - 620 | Test Een'},
    {identity:'motor',name:'AMBULANCE-MOTOR - 00620 | Test Twee'},
    {identity:'recovery-one',name:'LSRA-F.A.S.T. - 100 | Test Drie'},
    {identity:'recovery-two',name:'LSRA-F.A.S.T.-00100 | Test Vier'}
  ])});
  const result=await service.read();
  assert.equal(result.connected,true);
  assert.deepEqual(result.users.map(user=>[user.category,user.importable]),
    [['AMBULANCE',true],['AMBULANCE-MOTOR',true],['LSRA-F.A.S.T.',false],['LSRA-F.A.S.T.',false]]);
});

test('Radio normalization deduplicates identities and prevents ambiguous numeric-equivalent callsign imports',async()=>{
  const users=[
    validUser,
    {...validUser},
    {identity:'private-identity-two',name:'santo - 00620 | Andere agent',roomId:2},
    {identity:'private-identity-three',name:'BLAINE - 28 | Agent Vrij',roomId:'Dispatch'},
    {identity:'private-identity-four',name:'UNKNOWN - 77 | Onbekende categorie'},
    {identity:'private-identity-five',roomId:3}
  ];
  const service=createSonoranRadioService({env:configuredEnv,now:()=>startTime,fetchImpl:async()=>reply(users)});
  const result=await service.read();
  assert.equal(result.connected,true);
  assert.equal(result.users.length,5);
  assert.deepEqual(result.counts,{online:5,recognized:1});
  const ambiguous=result.users.filter(user=>user.category==='SANTO');
  assert.equal(ambiguous.length,2);
  assert.equal(ambiguous.every(user=>user.importable===false),true,'620 and00620 would claim the same TO callsign');
  assert.equal(result.users.find(user=>user.category==='BLAINE').importable,true);
  assert.equal(result.users.find(user=>user.category==='UNKNOWN').importable,false);
  for(const user of result.users){
    assert.deepEqual(Object.keys(user).sort(),['category','channel','displayName','id','importable','name','notAvailable','number','paired']);
    assert.equal(typeof user.id,'string');assert.ok(user.id);
  }
  assertPrivate(result);
});

test('Unexpected upstream fields and accidental credential echoes are excluded or redacted',async()=>{
  const source={...validUser,name:'SANTO - 620 | '+apiKey,roomId:apiKey,apiKey,token:apiKey,internalData:{secret:apiKey}};
  const service=createSonoranRadioService({env:configuredEnv,now:()=>startTime,fetchImpl:async()=>reply([source])});
  const result=await service.read();
  assert.equal(result.connected,true);
  assertPrivate(result);
  assert.equal(Object.hasOwn(result.users[0],'token'),false);
  assert.equal(Object.hasOwn(result.users[0],'internalData'),false);
});

test('Concurrent radio reads coalesce into one upstream request and cache for fifteen seconds',async()=>{
  let time=startTime,calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const service=createSonoranRadioService({env:configuredEnv,now:()=>time,fetchImpl:async()=>{calls++;await gate;return reply([validUser]);}});
  const first=service.read(),second=service.read();
  await new Promise(resolve=>setImmediate(resolve));
  try{assert.equal(calls,1);}finally{release();}
  const [a,b]=await Promise.all([first,second]);
  assert.deepEqual(a,b);
  assert.equal(a.users.length,1);
  time+=14999;
  assert.deepEqual(await service.read(),a);
  assert.equal(calls,1);
  time+=2;
  assert.equal((await service.read()).connected,true);
  assert.equal(calls,2);
});

test('A failed refresh preserves the last good snapshot as stale and recovers to a genuine empty snapshot',async()=>{
  let time=startTime,calls=0;
  const service=createSonoranRadioService({env:configuredEnv,now:()=>time,fetchImpl:async()=>{
    calls++;
    if(calls===1)return reply([validUser]);
    if(calls===2)throw Error('Upstream private-identity and '+apiKey);
    return reply([]);
  }});
  const first=await service.read();
  time+=15001;
  const stale=await service.read();
  assert.equal(stale.connected,false);
  assert.equal(stale.stale,true);
  assert.deepEqual(stale.users,first.users);
  assert.equal(stale.fetchedAt,first.fetchedAt);
  assertPrivate(stale);
  time+=1000;
  await service.read();assert.equal(calls,2,'Failed refreshes must also be rate limited');
  time+=15001;
  const recovered=await service.read();
  assert.equal(calls,3);
  assert.equal(recovered.connected,true);
  assert.equal(recovered.stale,false);
  assert.deepEqual(recovered.users,[]);
  assert.notEqual(recovered.fetchedAt,first.fetchedAt);
});

test('Sonoran authentication errors and malformed responses disclose neither credentials nor upstream body content',async()=>{
  const cases=[
    ()=>new Response('Private diagnostic '+apiKey+' private-identity',{status:401}),
    ()=>new Response('Private diagnostic '+apiKey+' private-identity',{status:500}),
    ()=>new Response('Not JSON '+apiKey,{status:200}),
    ()=>new Response(JSON.stringify({connectedUsers:{private:apiKey}}),{status:200}),
    ()=>{throw Error('Redirect to private-identity '+apiKey);}
  ];
  for(const response of cases){
    const service=createSonoranRadioService({env:configuredEnv,now:()=>startTime,fetchImpl:async()=>response()});
    const result=await service.read();
    assert.equal(result.configured,true);
    assert.equal(result.connected,false);
    assert.deepEqual(result.users,[]);
    assertPrivate(result);
  }
});

test('Oversized Sonoran response bodies and excessive row counts are rejected without exposing partial data',async()=>{
  const cases=[
    ()=>new Response(JSON.stringify({connectedUsers:[validUser]}),{status:200,headers:{'content-length':String(512*1024+1)}}),
    ()=>new Response(' '.repeat(512*1024+1),{status:200}),
    ()=>reply(Array.from({length:1001},(_,index)=>({...validUser,identity:'private-identity-'+index})))
  ];
  for(const response of cases){
    const service=createSonoranRadioService({env:configuredEnv,now:()=>startTime,fetchImpl:async()=>response()});
    const result=await service.read();
    assert.equal(result.connected,false);
    assert.deepEqual(result.users,[]);
    assertPrivate(result);
  }
});

test('Changing server bindings clears cached data and never reuses another community snapshot after a failure',async()=>{
  const env={...configuredEnv};let calls=0;
  const service=createSonoranRadioService({env,now:()=>startTime,fetchImpl:async()=>{
    calls++;if(calls===1)return reply([validUser]);throw Error('New community is unavailable');
  }});
  assert.equal((await service.read()).users.length,1);
  env.SONORAN_RADIO_COMMUNITY_ID='00000000-0000-4000-8000-000000000002';
  const changed=await service.read();
  assert.equal(calls,2);
  assert.equal(changed.connected,false);assert.equal(changed.stale,false);
  assert.equal(changed.fetchedAt,null);assert.deepEqual(changed.users,[]);
  delete env.SONORAN_RADIO_API_KEY;
  const missing=await service.read();
  assert.equal(missing.configured,false);assert.deepEqual(missing.users,[]);
  assert.equal(calls,2);
});

test('An old in-flight request cannot restore cached users after server bindings change',async()=>{
  const env={...configuredEnv};let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const service=createSonoranRadioService({env,now:()=>startTime,fetchImpl:async()=>{
    calls++;if(calls===1){await gate;return reply([validUser]);}return reply([]);
  }});
  const oldRead=service.read();
  await new Promise(resolve=>setImmediate(resolve));
  env.SONORAN_RADIO_COMMUNITY_ID='00000000-0000-4000-8000-000000000002';
  const current=await service.read();release();
  const oldResult=await oldRead;
  assert.equal(calls,2);
  assert.equal(current.connected,true);assert.deepEqual(current.users,[]);
  assert.deepEqual(oldResult,current);
  assert.deepEqual(await service.read(),current);
});
