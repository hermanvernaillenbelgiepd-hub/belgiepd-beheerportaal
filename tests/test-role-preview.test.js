import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRolePreviewAuthorized,TEST_PREVIEW_GROUPS,TEST_ROLE_PREVIEWS}
  from '../src/role-preview-policy.js';

const owner={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'beheerder',profileTechnicalAvailable:true,portalTechnicalMode:true};

test('TEST role preview requires signed technical owner, valid Discord and TEST Firebase',()=>{
 assert.equal(isRolePreviewAuthorized(owner,'belgiepd-test'),true);
 for(const modified of [
  {...owner,portalTechnicalMode:false},
  {...owner,profileTechnicalAvailable:false},
  {...owner,role:'officierenkader'},
  {...owner,discordId:'invalid'},
  {...owner,uid:'discord:222222222222222222'},
  {...owner,profileTechnicalAvailable:null}
 ]){
  assert.equal(isRolePreviewAuthorized(modified,'belgiepd-test'),false);
 }
 assert.equal(isRolePreviewAuthorized(owner,'belgiepd-main'),false);
 assert.equal(isRolePreviewAuthorized(owner,undefined),false);
});
test('Role and department selection has no duplicate IDs and covers all four services',()=>{
 assert.deepEqual(TEST_PREVIEW_GROUPS.map(x=>x.id),
   ['politie','brandweer','ambulance','depannage']);
 assert.equal(new Set(TEST_ROLE_PREVIEWS.map(x=>x.id)).size,TEST_ROLE_PREVIEWS.length);
 for(const {id} of TEST_PREVIEW_GROUPS)
   assert.ok(TEST_ROLE_PREVIEWS.some(x=>x.group===id),'Missing '+id);
 for(const profile of TEST_ROLE_PREVIEWS){
  assert.ok(profile.label.length>3&&profile.desc);
  assert.ok(profile.modules.length>=4);
  assert.ok(profile.modules.every(m=>['yes','no','conditional'].includes(m.state)));
 }
});
test('Both ZONE and AZLS snapshots never imply cross-service administration',()=>{
 const zone=TEST_ROLE_PREVIEWS.find(x=>x.id==='brandweer-zone');
 const azls=TEST_ROLE_PREVIEWS.find(x=>x.id==='ambulance-lead');
 const instructor=TEST_ROLE_PREVIEWS.find(x=>x.id==='ambulance-instructor');
 for(const p of [zone,azls,instructor]){
  assert.ok(p);
  assert.ok(p.modules.some(x=>x.key==='police'&&x.state==='yes'));
  assert.ok(p.modules.every(x=>x.key!=='to'&&x.key!=='admin'&&x.key!=='call'));
 }
 assert.equal(instructor.modules.find(x=>x.key==='staff').state,'no');
 assert.equal(azls.modules.find(x=>x.key==='dossier').state,'conditional');
 assert.equal(zone.modules.find(x=>x.key==='reports').state,'yes');
});
test('TEST API only returns simulation via an authorized GET and never touches real accounts',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/testmodus.html',import.meta.url),'utf8');
 const users=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/api\/testmodus\/rollen',requireUser/);
 assert.match(server,/isRolePreviewAuthorized\(req\.bpd,process\.env\.FIREBASE_PROJECT_ID\)/);
 assert.doesNotMatch(server,/app\.(?:post|put|patch|delete)\('\/api\/testmodus/);
 assert.match(page,/credentials:'same-origin'/);
 assert.match(page,/method:'GET'/);
 assert.doesNotMatch(page,/method:'POST'|method:'DELETE'|method:'PUT'|method:'PATCH'/);
 assert.doesNotMatch(page,/data-person-id|data-actor-id|impersonate|actAsAnotherUser/);
 assert.match(page,/id="workspace" class="workspace" hidden/);
 assert.match(page,/OEFENWEERGAVE · ALLEEN LEZEN/);
 assert.match(users,/id="rolePreviewLaunch" hidden/);
 assert.match(users,/\$\('rolePreviewLaunch'\)\.hidden=profile\.mode!=='technisch'/);
});
