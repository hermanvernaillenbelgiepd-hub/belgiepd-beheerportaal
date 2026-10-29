import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {refreshK9DisplayRoles,knownK9Candidate} from '../src/k9-live-discord-sync.js';
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
