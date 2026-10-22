import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedMiddleCandidate,stillEligibleAutoCadre,ensureVerifiedMiddleAccess,
  AUTO_CADRE_SOURCE} from '../src/verified-mid-cadre-access.js';
const id='111111111111111111',guild='222222222222222222',now=Date.UTC(2026,9,22,13,0,0);
const token={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,firebase:{sign_in_provider:'custom'}};
const roleIds=['1309532438053130326','1335578488664490057'];
const member={guildId:guild,roleIds,verifiedAt:now-1000,username:'Collega'};
const env={BPD_AUTO_APPROVE_POLICE_MIDDENKADER:'true'};
test('Verified mid cadre is exactly two independent, fresh, guild-scoped role IDs',()=>{
 assert.deepEqual(verifiedMiddleCandidate(token,member,guild,env,now),{
   discordId:id,username:'Collega',role:'middenkader',departments:['politie'],
   departmentRoles:{politie:'middenkader'}});
 for(const roles of [[],[roleIds[0]],[roleIds[1]],[...roleIds,'1473474238664020151'],
   [...roleIds,'1353670078142615592']]){
   assert.equal(verifiedMiddleCandidate(token,{...member,roleIds:roles},guild,env,now),null);
 }
 assert.equal(verifiedMiddleCandidate(token,member,guild,{},now),null);
 assert.equal(verifiedMiddleCandidate({...token,bpdDiscord:false},member,guild,env,now),null);
 assert.equal(verifiedMiddleCandidate({...token,bpdGuildId:'999999999999999999'},member,guild,env,now),null);
 assert.equal(verifiedMiddleCandidate(token,{...member,verifiedAt:now-16*60*1000},guild,env,now),null);
 assert.equal(verifiedMiddleCandidate(token,{...member,roleIds:['garbage',...roleIds]},guild,env,now),null);
});
function fakeDb(initial){
 let data=initial,events=[];
 const ref={collection:()=>({doc:()=>({})})};
 const store={collection:()=>({doc:()=>ref}),runTransaction:async fn=>{
   const staged=[];
   await fn({
     get:async()=>({exists:data!=null,data:()=>data,get:k=>data?.[k]}),
     set:(_ref,payload)=>staged.push(['set',payload]),
     create:(_ref,payload)=>staged.push(['audit',payload])
   });
   for(const [kind,payload] of staged){
     if(kind==='set')data={...data,...payload};
     events.push([kind,payload]);
   }
 }};
 return {store,events,get data(){return data}};
}
test('Blocked and manually approved accounts never get overwritten by an automatic rank',async()=>{
 for(const status of ['blocked','approved']){
   const db=fakeDb({discordId:id,status,role:'basiskader',
     departments:['politie'],departmentRoles:{politie:'basiskader'}});
   await ensureVerifiedMiddleAccess(db.store,token,member,guild,env,now);
   assert.equal(db.data.status,status);
   assert.equal(db.data.role,'basiskader');
   assert.equal(db.events.length,0);
 }
 for(const old of [null,{discordId:id,status:'pending',candidateDepartments:['politie']} ]){
   const db=fakeDb(old);
   const data=await ensureVerifiedMiddleAccess(db.store,token,member,guild,env,now);
   assert.equal(data.role,'middenkader');
   assert.equal(db.data.status,'approved');
   assert.equal(db.data.approvalSource,AUTO_CADRE_SOURCE);
   assert.deepEqual(db.data.departments,['politie']);
   assert.deepEqual(db.events.map(x=>x[0]),['set','audit']);
 }
});
test('Auto grant checks continuing guild-role eligibility, expiry and separate manual override',()=>{
 const record={discordId:id,status:'approved',role:'middenkader',
   departments:['politie'],departmentRoles:{politie:'middenkader'},
   approvalSource:AUTO_CADRE_SOURCE};
 assert.equal(stillEligibleAutoCadre(token,member,guild,env,record,now),true);
 assert.equal(stillEligibleAutoCadre(token,{...member,roleIds:[roleIds[0]]},guild,env,record,now),false);
 assert.equal(stillEligibleAutoCadre(token,{...member,verifiedAt:now-25*60*60*1000},guild,env,record,now),false);
 assert.equal(stillEligibleAutoCadre(token,member,guild,{},record,now),false);
 assert.equal(stillEligibleAutoCadre(token,member,guild,{}, {...record,approvalSource:null},now),true);
});
test('Both access paths derive roles on server, audit and preserve manual approval boundary',()=>{
 const f=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const server=f('src/server.js'),routes=f('src/user-routes.js'),ui=f('public/personeelsbeheer.html');
 assert.ok(server.includes('ensureVerifiedMiddleAccess(store,verified,member,'));
 assert.ok(server.includes('stillEligibleAutoCadre(verified,member,process.env.DISCORD_GUILD_ID,'));
 assert.ok(server.includes("managed.get('approvalSource')===AUTO_CADRE_SOURCE"));
 assert.ok(routes.includes("app.get('/api/users/me'"));
 assert.ok(routes.includes('ensureVerifiedMiddleAccess(db(),decoded,member,'));
 assert.ok(routes.includes('approvalSource:FieldValue.delete()'));
 assert.ok(ui.includes('Politie en Middenkader'));
 assert.equal(ui.includes('TEST heeft een eigen Firebase-project'),false);
});
