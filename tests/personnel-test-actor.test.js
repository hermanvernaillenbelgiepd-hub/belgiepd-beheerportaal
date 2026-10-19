import test from 'node:test';
import assert from 'node:assert/strict';
import {personnelTestActor} from '../src/personnel-test-actor.js';
import {canEditPersonnel,canViewPersonnel} from '../src/personnel-editor-policy.js';
const id='505659510359064606';
const actor={uid:'discord:'+id,discordId:id,role:'basiskader',departments:['politie'],
  departmentRoles:{politie:'basiskader'},email:''};
const env={FIREBASE_PROJECT_ID:'belgiepd-test',BPD_TEST_FIXTURES:'true',
  BPD_TEST_PERSONNEL_EDITOR_DISCORD_ID:id};
test('Isolated test account can edit only fictitious police subordinate',()=>{
  const a=personnelTestActor(actor,env);
  assert.equal(a.personnelTestMode,true);
  assert.equal(a.role,'officierenkader');
  assert.equal(canViewPersonnel(a,'politie'),true);
  assert.equal(canViewPersonnel(a,'ambulance'),false);
  assert.equal(canEditPersonnel(a,{personId:'222222222222222222',dept:'politie',rank:'Inspecteur'}),true);
  assert.equal(canEditPersonnel(a,{personId:'111111111111111111',dept:'politie',rank:'Commissaris'}),false);
  assert.equal(canEditPersonnel(a,{personId:'222222222222222222',dept:'ambulance',rank:'Ambulancier'}),false);
  assert.equal(actor.role,'basiskader');
});
test('Never grant on production or without fixtures or without explicit tester ID',()=>{
  for(const changes of [
    {FIREBASE_PROJECT_ID:'belgiepd-prod'},
    {BPD_TEST_FIXTURES:'false'},
    {BPD_TEST_PERSONNEL_EDITOR_DISCORD_ID:''},
    {BPD_TEST_PERSONNEL_EDITOR_DISCORD_ID:'123456789012345678'},
  ]){
    assert.equal(personnelTestActor(actor,{...env,...changes}),actor);
  }
});
test('Never grant to a different signed-in Discord account or a non-police member',()=>{
  assert.equal(personnelTestActor({...actor,discordId:'123456789012345678'},env).personnelTestMode,undefined);
  assert.equal(personnelTestActor({...actor,departments:['ambulance']},env).personnelTestMode,undefined);
  assert.equal(personnelTestActor({role:'basiskader'},env).personnelTestMode,undefined);
});
