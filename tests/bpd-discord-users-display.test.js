import test from 'node:test';
import assert from 'node:assert/strict';
import {
 fetchBelgiumPdDisplayRoles,createBelgiumPdDisplayRoleSource,
 organogramDisplayIdentityMap
} from '../src/bpd-discord-users-display.js';
import {BPD_DISCORD_USERS_URL} from '../src/bpd-discord-users-probe.js';

const person='123456789012345678',other='123456789012345679';
const role='1309532437952466986',fire='1399000349037166664';
const token='a-secure-api-test-token';
const env={BPD_DISCORD_USERS_API_TOKEN:token};
const make=body=>({ok:true,status:200,headers:{get:()=>null},
 text:async()=>body});
const fetchRaw=raw=>async(url,options)=>{
 assert.equal(url,BPD_DISCORD_USERS_URL);
 assert.equal(options.headers.Authorization,'Bearer '+token);
 assert.equal(options.redirect,'error');
 return make(raw);
};
test('exactly preserves numeric snowflakes and isolates role snapshots from names and privileges',async()=>{
 const raw='[{"discord_id":123456789012345678,"name":"Do not reveal","roles":['+
  '{"id":1309532437952466986,"name":"BW log/signa"},'+
  '{"id":1399000349037166664,"name":"Ladderwagen"}]},'+
  '{"discord_id":123456789012345679,"name":"Other","roles":[]}]';
 const result=await fetchBelgiumPdDisplayRoles({env,fetchImpl:fetchRaw(raw)});
 assert.equal(result.status,'ok');
 assert.equal(result.memberCount,2);
 assert.deepEqual(result.entries.get(person),[role,fire]);
 assert.deepEqual(result.entries.get(other),[]);
 assert.equal(result.entries.has('123456789012345680'),false);
 assert.ok(!JSON.stringify([...result.entries]).includes('Do not reveal'));
});
test('duplicate member IDs and incorrect role IDs are rejected in full',async()=>{
 const duplicate='[{"discord_id":123456789012345678,"roles":[]},'+
  '{"discord_id":123456789012345678,"roles":[]}]';
 const result=await fetchBelgiumPdDisplayRoles({env,fetchImpl:fetchRaw(duplicate)});
 assert.equal(result.status,'invalid_or_duplicate_member');
 assert.equal(result.entries.size,0);
 const broken=await fetchBelgiumPdDisplayRoles({env,fetchImpl:fetchRaw(
  '[{"discord_id":123456789012345678,"roles":[{"id":"bogus"}]}]'
 )});
 assert.equal(broken.status,'invalid_role');
 assert.equal(broken.entries.size,0);
});
test('an API error never returns partial staff roles',async()=>{
 const response=await fetchBelgiumPdDisplayRoles({env,fetchImpl:async()=>({status:401,ok:false})});
 assert.deepEqual(response,{status:'unauthorized',entries:new Map(),memberCount:0,roleCount:0});
});
test('memory source coalesces concurrent requests, expires, then uses a new snapshot',async()=>{
 let at=1000,calls=0;
 const load=async()=>{calls++;return {status:'ok',entries:new Map([[person,[role]]]),memberCount:1,roleCount:1}};
 const get=createBelgiumPdDisplayRoleSource({load,now:()=>at,ttlMs:90});
 const [a,b]=await Promise.all([get(),get()]);
 assert.equal(a,b);assert.equal(calls,1);
 at=1070;await get();assert.equal(calls,1);
 at=1100;await get();assert.equal(calls,2);
});
test('overlay matches exact staff Discord IDs and does not mutate cached auth evidence',()=>{
 const source=new Map([[person,{guildId:'guild',roleIds:['different'],verifiedAt:1}]]);
 const snapshot={status:'ok',entries:new Map([[person,[role]],[other,[fire]]]),memberCount:2};
 const out=organogramDisplayIdentityMap({entries:source},snapshot,
  [{personId:person},{personId:'123456789012345680'}],
  '111111111111111111',1000);
 assert.equal(out.matches,1);assert.equal(out.fromApi,true);
 assert.deepEqual(out.entries.get(person).roleIds,[role]);
 assert.equal(out.entries.get(person).displaySource,'bpd-users-api');
 assert.deepEqual(source.get(person).roleIds,['different']);
 assert.equal(source.has(other),false);
 assert.equal(out.entries.has(other),false);
 const fallback=organogramDisplayIdentityMap({entries:source},{status:'connection_failed'},
  [{personId:person}],'111111111111111111',1000);
 assert.equal(fallback.matches,0);
 assert.equal(fallback.entries.get(person),source.get(person));
});

test('ambiguous repeated personnel record in one service never receives API overlay',()=>{
 const source={entries:new Map([[person,{roleIds:['999'],guildId:'111111111111111111'}]])};
 const api={status:'ok',entries:new Map([[person,[role]]]),memberCount:1};
 const sameService=organogramDisplayIdentityMap(source,api,
  [{personId:person,dept:'brandweer'},{personId:person,dept:'brandweer'}],
  '111111111111111111',1000);
 assert.equal(sameService.matches,0);
 assert.deepEqual(sameService.entries.get(person).roleIds,['999']);
 const twoServices=organogramDisplayIdentityMap(source,api,
  [{personId:person,dept:'brandweer'},{personId:person,dept:'politie'}],
  '111111111111111111',1000);
 assert.equal(twoServices.matches,2);
 assert.deepEqual(twoServices.entries.get(person).roleIds,[role]);
});
