import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleForTechnicalProfile,technicalCookieIsValid,makeProfileCookie,
  clearProfileCookie,technicalActor,verifiedPoliceRank
} from '../src/portal-profile-mode.js';
const id='505659510359064606',guild='1309532437952466984',now=Date.UTC(2026,9,22);
const env={DISCORD_GUILD_ID:guild,BPD_TECHNICAL_ADMIN_DISCORD_IDS:id,
  BPD_PORTAL_PROFILE_SIGNING_KEY:'a very long test signing key for technical profile sessions'};
const decoded={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,
  firebase:{sign_in_provider:'custom'}};
const actor={uid:'discord:'+id,discordId:id,role:'officierenkader',
  departments:['politie'],departmentRoles:{politie:'officierenkader'}};
const member={guildId:guild,roleIds:['1335578488664490057'],verifiedAt:now-1000};
test('Only exactly approved and freshly verified Discord identity may use technical profile',()=>{
  assert.equal(eligibleForTechnicalProfile(decoded,actor,member,env,now),true);
  assert.equal(eligibleForTechnicalProfile({...decoded,bpdDiscord:false},actor,member,env,now),false);
  assert.equal(eligibleForTechnicalProfile({...decoded,uid:'discord:111111111111111111'},actor,member,env,now),false);
  assert.equal(eligibleForTechnicalProfile(decoded,actor,{...member,verifiedAt:now-900001},env,now),false);
  assert.equal(eligibleForTechnicalProfile(decoded,actor,member,{...env,BPD_TECHNICAL_ADMIN_DISCORD_IDS:''},now),false);
  assert.equal(eligibleForTechnicalProfile(decoded,actor,member,{...env,DISCORD_GUILD_ID:'222222222222222222'},now),false);
  assert.equal(eligibleForTechnicalProfile(decoded,actor,member,{...env,BPD_PORTAL_PROFILE_SIGNING_KEY:'short'},now),false);
  assert.equal(verifiedPoliceRank(member,guild,now),'middenkader');
});
test('Technical cookie is signed, identity-bound, short-lived, and HttpOnly',()=>{
  const cookie=makeProfileCookie(decoded.uid,id,env.BPD_PORTAL_PROFILE_SIGNING_KEY,now);
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=3600/);
  assert.equal(technicalCookieIsValid(cookie,decoded.uid,id,env.BPD_PORTAL_PROFILE_SIGNING_KEY,now+30000),true);
  assert.equal(technicalCookieIsValid(cookie,'discord:111111111111111111','111111111111111111',env.BPD_PORTAL_PROFILE_SIGNING_KEY,now+30000),false);
  assert.equal(technicalCookieIsValid(cookie,decoded.uid,id,env.BPD_PORTAL_PROFILE_SIGNING_KEY,now+3600001),false);
  assert.equal(technicalCookieIsValid(cookie.replace('=eyJ','=aeyJ'),decoded.uid,id,env.BPD_PORTAL_PROFILE_SIGNING_KEY,now),false);
  assert.match(clearProfileCookie(),/Max-Age=0/);
});
test('Technical overlay never persists changed personnel rank or identity',()=>{
  const elevated=technicalActor(actor);
  assert.equal(elevated.role,'beheerder');
  assert.equal(elevated.operationalRole,'officierenkader');
  assert.equal(elevated.discordId,id);
  assert.equal(elevated.departmentRoles.brandweer,'korpsleiding');
  assert.equal(elevated.portalTechnicalMode,true);
  assert.deepEqual(actor.departments,['politie']);
  assert.equal(actor.role,'officierenkader');
});
test('Profile routes only switch signed cookies after verified authentication and audit',async()=>{
  const {readFileSync}=await import('node:fs');
  const src=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/user-routes.js',import.meta.url),'utf8');
  assert.ok(src.includes('eligibleForTechnicalProfile(verified,actor,discordMember,process.env)'));
  assert.ok(src.includes('technicalCookieIsValid(req.headers.cookie'));
  assert.ok(routes.includes("app.post('/api/users/profile',requireUser"));
  assert.ok(routes.includes("collection('bpd_portal_profile_audit').add("));
  assert.ok(routes.includes('makeProfileCookie(req.bpd.uid,req.bpd.discordId'));
});

test('Technical profile supports privileged operational routes without raising normal police access',async()=>{
  const {readFileSync}=await import('node:fs');
  const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
  assert.ok(read('callsign-routes.js').includes('req.bpd.portalTechnicalMode===true||canDecide(req.bpd.role)'));
  assert.ok(read('management-routes.js').includes("req.bpd.portalTechnicalMode!==true&&req.bpd.fireZoneChief!==true"));
  assert.ok(read('registration-routes.js').includes("req.bpd.dossierFullDepartments?.includes(dept)"));
  assert.ok(read('registrations.js').includes("dept==='brandweer'&&user.fireZoneChief===true"));
  assert.ok(read('user-routes.js').includes("mode:'politie',at:FieldValue.serverTimestamp()"));
});
