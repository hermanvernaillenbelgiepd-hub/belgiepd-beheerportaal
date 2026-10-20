import test from 'node:test';
import assert from 'node:assert/strict';
import {createSonoranRadioService,parseSonoranName} from '../src/to-radio.js';

const apiKey='test-only-sonoran-secret-do-not-export';
const communityId='00000000-0000-4000-8000-000000000001';
const configuredEnv={SONORAN_RADIO_API_KEY:apiKey,SONORAN_RADIO_COMMUNITY_ID:communityId};
const startTime=Date.UTC(2026,9,20,14,0);
const reply=(users,options={})=>new Response(JSON.stringify({connectedUsers:users}),{status:200,headers:{'content-type':'application/json'},...options});
const validUser={identity:'private-identity-one',name:'SANTO - 620 | Agent Test',roomId:1};

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
    assert.deepEqual(Object.keys(user).sort(),['category','channel','displayName','id','importable','name','number']);
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
