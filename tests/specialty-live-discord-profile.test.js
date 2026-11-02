import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyLiveSpecialtyRoles} from '../src/specialty-live-discord-sync.js';
import {verifiedSyncRoles} from '../src/organogram-placement-policy.js';

const personId='622486684033875968';
const guild='111111111111111111';
const env={DISCORD_GUILD_ID:guild,BPD_DISCORD_BOT_TOKEN:'t'.repeat(50)};
const roleId='1337775768083632158';
const now=Date.now();

test('live specialty verifier reads guild member roles but never mutates Discord',async()=>{
 let requestedUrl='',requestedOptions;
 const result=await verifyLiveSpecialtyRoles(personId,{env,fetchImpl:async(url,options)=>{
  requestedUrl=url;requestedOptions=options;
  return {ok:true,status:200,json:async()=>({
   roles:[roleId],joined_at:'2026-10-01T10:00:00.000Z',user:{id:personId}
  })};
 }});
 assert.deepEqual(result,{verified:true,status:'ok',roleIds:[roleId]});
 assert.equal(requestedOptions.method,'GET');
 assert.equal(requestedOptions.redirect,'error');
 assert.equal(requestedUrl,'https://discord.com/api/v10/guilds/'+guild+'/members/'+personId);
 const sync=verifiedSyncRoles({guildId:guild,verifiedAt:now,roleIds:result.roleIds},'politie',guild,now);
 assert.equal(sync.aeRole,'teamleader');
 assert.deepEqual(sync.aeRoles,['teamleader']);
 assert.ok(sync.specialties.includes('AE'));
});

test('malformed Discord reply, missing bot and no guild membership never award roles',async()=>{
 const missing=await verifyLiveSpecialtyRoles(personId,{env:{},fetchImpl:async()=>{throw Error('should not fetch')}});
 assert.equal(missing.verified,false);
 const wrongPerson=await verifyLiveSpecialtyRoles(personId,{env,fetchImpl:async()=>({
  ok:true,status:200,json:async()=>({roles:[roleId],joined_at:'2026-10-01',user:{id:guild}})
 })});
 assert.equal(wrongPerson.verified,false);
 const notMember=await verifyLiveSpecialtyRoles(personId,{env,fetchImpl:async()=>({ok:false,status:404})});
 assert.equal(notMember.status,'not_in_guild');
 assert.deepEqual(notMember.roleIds,[]);
 const limited=await verifyLiveSpecialtyRoles(personId,{env,fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(limited.verified,false);
});

test('personnel card refresh is scoped to one roster member and never modifies rights',()=>{
 const backend=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../src/specialization-routes.js',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../src/specialty-role-link-routes.js',import.meta.url),'utf8');
 assert.match(backend,/specialty-check\/:dept\/:call/);
 assert.match(backend,/targets\.length!==1/);
 assert.match(backend,/displayOnly:true/);
 assert.match(backend,/verifyLiveSpecialtyRoles\(staff\.personId\)/);
 assert.match(html,/refreshProfileSpecialtyRoles\(p,profileKey\)/);
 assert.match(html,/name==='RADIO\/BM'\?'':/);
 assert.match(html,/const autoAE=Array\.isArray\(response\.aeRoles\)/);
 assert.match(html,/person\.aeRoles=\[\.\.\.new Set\(\[\.\.\.autoAE/);
 assert.match(dossier,/verifyLiveSpecialtyRoles\(staff\.personId\)/);
 assert.match(admin,/verifyLiveSpecialtyRoles\(discordId\)/);
});
