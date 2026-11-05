import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGuildAuthorizationRoles} from '../src/discord-guild-authorization.js';
import {verifiedCitizenCouncil,CITIZEN_ROLES} from '../src/citizen-dossier-policy.js';
const id='1398985105254650001',guild='1398985105254650002';
const env={DISCORD_GUILD_ID:guild,BPD_DISCORD_BOT_TOKEN:'a'.repeat(50)};
const member=roles=>({roles,user:{id},joined_at:'2026-01-01T00:00:00Z'});
const reply=(status,body)=>({status,ok:status===200,
 json:async()=>body});
test('authoritative guild check verifies only the authenticated guild member',async()=>{
 const urls=[];
 const live=await verifyGuildAuthorizationRoles(id,{env,cacheResults:false,fetchImpl:async(url,args)=>{
  urls.push({url,method:args.method,authorization:args.headers.Authorization});
  return reply(200,member([CITIZEN_ROLES.burgerraad,CITIZEN_ROLES.burger]));
 }});
 assert.equal(live.status,'ok');
 assert.deepEqual(live.roleIds,[CITIZEN_ROLES.burgerraad,CITIZEN_ROLES.burger]);
 assert.deepEqual(urls.map(x=>x.url),[
  'https://discord.com/api/v10/guilds/'+guild+'/members/'+id
 ]);
 assert.equal(urls[0].method,'GET');
 const actor={uid:'discord:'+id,discordId:id};
 assert.equal(verifiedCitizenCouncil(actor,{guildId:guild,
  verifiedAt:Date.now(),roleIds:live.roleIds},guild),true);
});
test('no role, 404, unavailable bot or forged identity cannot grant Burgerraad',async()=>{
 const noCouncil=await verifyGuildAuthorizationRoles(id,{env,cacheResults:false,
  fetchImpl:async()=>reply(200,member([CITIZEN_ROLES.burger]))});
 assert.equal(noCouncil.roleIds.includes(CITIZEN_ROLES.burgerraad),false);
 const removed=await verifyGuildAuthorizationRoles(id,{env,cacheResults:false,
  fetchImpl:async()=>reply(404,null)});
 assert.equal(removed.status,'not_member');
 const absent=await verifyGuildAuthorizationRoles(id,{env:{DISCORD_GUILD_ID:guild},
  cacheResults:false});
 assert.equal(absent.status,'bot_unavailable');
 const wrong=await verifyGuildAuthorizationRoles('INVALID',{env,cacheResults:false});
 assert.equal(wrong.status,'invalid_identity');
});
test('server never derives technical or citizen grants from the display-only roster API',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const citizens=readFileSync(new URL('../src/citizen-dossier-routes.js',import.meta.url),'utf8');
 assert.match(server,/verifyGuildAuthorizationRoles\(discordId\)/);
 assert.match(citizens,/verifyGuildAuthorizationRoles\(actor\.discordId\)/);
 assert.doesNotMatch(citizens,/getBelgiumPdDisplayRoles/);
});
