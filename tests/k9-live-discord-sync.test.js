import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {refreshK9DisplayRoles,knownK9Candidate,verifyK9DisplayRoleNow} from '../src/k9-live-discord-sync.js';
import {K9_ROLE_IDS,verifiedK9DisplayRole,effectiveK9DisplayRole} from '../src/k9-display-role.js';

const guild='123456789012345678';
const env={DISCORD_GUILD_ID:guild,DISCORD_BOT_TOKEN:'x'.repeat(42)};
const joined_at='2024-05-10T10:00:00.000Z';
const ids=['111111111111111111','222222222222222222','333333333333333333','444444444444444444'];
const response=(id,roles)=>({ok:true,status:200,json:async()=>({user:{id},joined_at,roles})});

test('K9 candidates include existing K9 registrations and previous K9/IO snapshots, not every user',()=>{
 const member=id=>({dept:'politie',personId:id});
 assert.equal(knownK9Candidate(member(ids[0]),{specialties:['K9']},null,'',Object.values(K9_ROLE_IDS)),true);
 assert.equal(knownK9Candidate(member(ids[0]),{specialties:[]},{roleIds:[K9_ROLE_IDS.geleider_in_stage]},'',Object.values(K9_ROLE_IDS)),true);
 assert.equal(knownK9Candidate(member(ids[0]),{specialties:[]},null,'geleider',Object.values(K9_ROLE_IDS)),true);
 assert.equal(knownK9Candidate({...member(ids[0]),specialties:[{label:'K9-IO',value:'Ja'}]},
  {specialties:[]},null,'',Object.values(K9_ROLE_IDS)),true);
 assert.equal(knownK9Candidate(member(ids[0]),{specialties:['MOTARD']},null,'',Object.values(K9_ROLE_IDS)),false);
 assert.equal(knownK9Candidate({...member(ids[0]),dept:'brandweer'},{specialties:['K9']},null,'',Object.values(K9_ROLE_IDS)),false);
});
test('K9 bot roles refresh without login, with instructor > full handler > K9-IO',async()=>{
 let calls=0;
 const byId={
  [ids[0]]:[K9_ROLE_IDS.geleider,K9_ROLE_IDS.geleider_in_stage],
  [ids[1]]:[K9_ROLE_IDS.geleider_in_stage],
  [ids[2]]:[K9_ROLE_IDS.geleider,K9_ROLE_IDS.instructeur,K9_ROLE_IDS.geleider_in_stage]
 };
 const fetchImpl=async(url,options)=>{
  calls++;
  assert.match(url,/^https:\/\/discord\.com\/api\/v10\/guilds\/123456789012345678\/members\/\d+$/);
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bot '+'x'.repeat(42));
  const id=url.split('/').at(-1);
  return response(id,byId[id]||[]);
 };
 const refreshed=await refreshK9DisplayRoles(ids.slice(0,3),{env,fetchImpl});
 assert.equal(refreshed.available,true);
 assert.equal(refreshed.roles.get(ids[0]),'geleider');
 assert.equal(refreshed.roles.get(ids[1]),'geleider_in_stage');
 assert.equal(refreshed.roles.get(ids[2]),'instructeur');
 assert.equal(calls,3);
 const again=await refreshK9DisplayRoles(ids.slice(0,3),{env,fetchImpl});
 assert.equal(again.roles.get(ids[0]),'geleider');
 assert.equal(calls,3,'a rapid repeat must be served from the 10-minute TTL');
});
test('Discord 404 clears a cached K9 presentation role; API errors do not fabricate roles',async()=>{
 const notFound=await refreshK9DisplayRoles([ids[3]],{env,fetchImpl:async()=>({ok:false,status:404})});
 assert.equal(notFound.roles.has(ids[3]),true);
 assert.equal(notFound.roles.get(ids[3]),'');
 assert.equal(verifiedK9DisplayRole({guildId:guild,roleIds:[K9_ROLE_IDS.geleider],verifiedAt:Date.now()},guild),'geleider');
 assert.equal(effectiveK9DisplayRole('geleider',''),'geleider','officer override still wins');
 const unavailable=await refreshK9DisplayRoles([ids[0]],{env:{}});
 assert.equal(unavailable.available,false);
 assert.equal(unavailable.roles.size,0);
});
test('K9 bot refresh must never update identities or replace permission checks',()=>{
 const src=readFileSync(new URL('../src/k9-live-discord-sync.js',import.meta.url),'utf8');
 const routes=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/getFirestore|FieldValue|\.collection\(|\.runTransaction\(|\.batch\(/);
 assert.match(routes,/liveK9\.roles\.has\(p\.personId\)/);
 assert.match(routes,/verifiedK9DisplayRole\(roles\.entries\.get\(p\.personId\),process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(routes,/merged\.k9Role=effectiveK9DisplayRole\(/);
 assert.match(routes,/app\.get\('\/api\/organogram\/hierarchie',requireUser/);
});

test('targeted verified check gives a safe reason, bypasses cache and refreshes matching badge',async()=>{
 const id='777777777777777777';
 let roles=[K9_ROLE_IDS.geleider_in_stage],count=0;
 const fetchImpl=async(url,options)=>{
  count++;
  assert.equal(url.split('/').at(-1),id);
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  return response(id,roles);
 };
 const first=await verifyK9DisplayRoleNow(id,{env,fetchImpl});
 assert.deepEqual(first,{status:'ok',role:'geleider_in_stage',verified:true});
 roles=[K9_ROLE_IDS.geleider,K9_ROLE_IDS.geleider_in_stage];
 const fresh=await verifyK9DisplayRoleNow(id,{env,fetchImpl});
 assert.deepEqual(fresh,{status:'ok',role:'geleider',verified:true});
 assert.equal(count,2,'a targeted check must bypass the display cache');
 const cached=await refreshK9DisplayRoles([id],{env,fetchImpl});
 assert.equal(cached.roles.get(id),'geleider');
 assert.equal(count,2,'normal view uses latest verified targeted result');
});
test('targeted check distinguishes Discord absence, configuration and transport errors',async()=>{
 const id='888888888888888888';
 const forbidden=await verifyK9DisplayRoleNow(id,{env,
  fetchImpl:async()=>({ok:false,status:403})});
 assert.deepEqual(forbidden,{status:'discord_forbidden',role:'',verified:false});
 const missing=await verifyK9DisplayRoleNow(id,{env,
  fetchImpl:async()=>({ok:false,status:404})});
 assert.deepEqual(missing,{status:'not_in_guild',role:'',verified:true});
 const noRole=await verifyK9DisplayRoleNow(id,{env,
  fetchImpl:async()=>response(id,[])});
 assert.deepEqual(noRole,{status:'no_k9_role',role:'',verified:true});
 const unconfigured=await verifyK9DisplayRoleNow(id,{env:{}});
 assert.deepEqual(unconfigured,{status:'bot_unconfigured',role:'',verified:false});
 const unreachable=await verifyK9DisplayRoleNow(id,{env,
  fetchImpl:async()=>{throw Error('network')}} );
 assert.deepEqual(unreachable,{status:'network_error',role:'',verified:false});
});
test('targeted role check is gated by OFF/KL permission and only matches an existing police employee',()=>{
 const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(route,/app\.post\('\/api\/organogram\/k9\/:personId\/verify',requireUser/);
 assert.match(route,/if\(!canEditK9Display\(req\.bpd\)\)/);
 assert.match(route,/snapshot\.data\.some\(p=>validRow\(p\)&&p\.dept==='politie'&&p\.personId===personId\)/);
 assert.match(route,/k9VerificationCooldown\.get\(key\)/);
 assert.match(route,/return res\.json\(\{checked:result\.verified,status:result\.status/);
 assert.match(page,/id="k9-verify-now"/);
 assert.match(page,/method:'POST'/);
 assert.match(page,/no_k9_role:'Discord bevestigt dit serverlid/);
});
