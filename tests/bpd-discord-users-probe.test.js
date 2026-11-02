import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BPD_DISCORD_USERS_URL,probeBelgiumPdDiscordUsers,parseDiscordUsersJsonLossless} from '../src/bpd-discord-users-probe.js';

const token='a-test-bearer-token-value';
const id='1309532437952466986';
const member='123456789012345678';
const response=(body,{status=200}={})=>({
 ok:status>=200&&status<300,status,
 headers:{get:()=>null},
 text:async()=>typeof body==='string'?body:JSON.stringify(body)
});
test('does not call external service if no API key is configured',async()=>{
 let called=false;
 assert.deepEqual(await probeBelgiumPdDiscordUsers({env:{},fetchImpl:async()=>{called=true}}),{status:'not_configured'});
 assert.equal(called,false);
});
test('calls only the fixed HTTPS URL using a server-side bearer token, then reports counts only',async()=>{
 let url,headers,options;
 const res=await probeBelgiumPdDiscordUsers({env:{BPD_DISCORD_USERS_API_TOKEN:token},
  fetchImpl:async(u,opts)=>{url=u;headers=opts.headers;options=opts;
   return response([{discord_id:member,name:'Private person',roles:[{id,name:'Private role'}]}]);}
 });
 assert.equal(url,BPD_DISCORD_USERS_URL);
 assert.equal(headers.Authorization,'Bearer '+token);
 assert.equal(options.redirect,'error');
 assert.deepEqual(res,{status:'ok',memberCount:1,roleCount:1});
 assert.ok(!JSON.stringify(res).includes(member));
 assert.ok(!JSON.stringify(res).includes(token));
 assert.ok(!JSON.stringify(res).includes('Private'));
});
test('accepts wrapped data/users, preserves numeric IDs and rejects invalid short IDs',async()=>{
 const fetchImpl=async()=>response({data:{users:[{discord_id:member,roles:[{id}]}]}});
 assert.equal((await probeBelgiumPdDiscordUsers({env:{BPD_DISCORD_USERS_API_TOKEN:token},fetchImpl})).status,'ok');
 // Raw JSON is essential: constructing a JS Number first would round the ID.
 const raw='[{"discord_id":123456789012345678,"roles":[{"id":1309532437952466986}]}]';
 const numerical=async()=>response(raw);
 assert.equal((await probeBelgiumPdDiscordUsers({
  env:{BPD_DISCORD_USERS_API_TOKEN:token},fetchImpl:numerical
 })).status,'ok');
 const invalid=async()=>response([{discord_id:123456,roles:[{id}]}]);
 assert.equal((await probeBelgiumPdDiscordUsers({
  env:{BPD_DISCORD_USERS_API_TOKEN:token},fetchImpl:invalid
 })).status,'unexpected_schema');
});
test('reports failed tokens and failed schema without leaking API content',async()=>{
 const env={BPD_DISCORD_USERS_API_TOKEN:token};
 for(const [code,want] of [[401,'unauthorized'],[403,'forbidden'],[404,'not_found'],[429,'rate_limited'],[500,'api_unavailable']]){
  assert.deepEqual(await probeBelgiumPdDiscordUsers({env,fetchImpl:async()=>response({}, {status:code})}),{status:want});
 }
 assert.equal((await probeBelgiumPdDiscordUsers({env,fetchImpl:async()=>response('not-json')})).status,'invalid_json');
 assert.equal((await probeBelgiumPdDiscordUsers({env,fetchImpl:async()=>{throw Error('secret')}})).status,'connection_failed');
});
test('server performs only startup diagnostic, not automatic permissions changes',()=>{
 const src=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(src,/probeBelgiumPdDiscordUsers/);
 assert.match(src,/BelgiumPD Discord-leden-API:/);
 assert.doesNotMatch(src,/console\.(?:info|log|warn)\([^\n]*BPD_DISCORD_USERS_API_TOKEN/);
});

test('unexpected JSON schema reports only whitelisted field types, never contents',async()=>{
 const env={BPD_DISCORD_USERS_API_TOKEN:token};
 const res=await probeBelgiumPdDiscordUsers({env,fetchImpl:async()=>response({
  data:{items:[{discordId:member,secretName:'Never log me',roles:[id]}]},
  unrelatedPayload:'private'
 })});
 assert.equal(res.status,'unexpected_schema');
 assert.equal(res.shape.idField,'discordId');
 assert.equal(res.shape.idType,'string');
 assert.equal(res.shape.roleField,'roles');
 assert.equal(res.shape.roleItemType,'string');
 const display=JSON.stringify(res);
 for(const privateValue of [token,member,id,'Never log me','private']){
  assert.ok(!display.includes(privateValue));
 }
});

test('preserves the EXACT digits of unquoted Discord snowflakes in a JSON response',async()=>{
 const raw='[{"discord_id":123456789012345678,"name":"A","roles":[{"id":987654321098765432,"name":"Ladderwagen"}]}]';
 const parsed=parseDiscordUsersJsonLossless(raw);
 assert.equal(parsed[0].discord_id,'123456789012345678');
 assert.equal(parsed[0].roles[0].id,'987654321098765432');
 const env={BPD_DISCORD_USERS_API_TOKEN:token};
 const result=await probeBelgiumPdDiscordUsers({env,fetchImpl:async()=>response(raw)});
 assert.deepEqual(result,{status:'ok',memberCount:1,roleCount:1});
});
test('does not transform digits inside quoted strings or decimal measurements',()=>{
 const raw='{"users":[{"discord_id":"123456789012345678","roles":[{"id":987654321098765432}],'+
  '"description":"quoted 987654321098765432","weight":10.12345678901234567}]}';
 const parsed=parseDiscordUsersJsonLossless(raw);
 assert.equal(parsed.users[0].description,'quoted 987654321098765432');
 assert.equal(parsed.users[0].roles[0].id,'987654321098765432');
 assert.equal(typeof parsed.users[0].weight,'number');
});
