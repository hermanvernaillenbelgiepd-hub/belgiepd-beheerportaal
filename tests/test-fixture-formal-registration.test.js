import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {registeredActorForTestFixtures} from '../src/registration-routes.js';

const id='333333333333333333';
const guild='1309532438053130326';
const user={uid:'discord:'+id,discordId:id,role:'officierenkader',
  departments:['politie'],departmentRoles:{politie:'officierenkader'},
  dossierNativeDepartments:['politie']};
const member=()=>({guildId:guild,verifiedAt:Date.now()-20_000,
  roleIds:['1309532438053130326'],username:'Kader Tester'});
test('Fictieve TEST-dossiers hebben een geverifieerde, echte Discord-auteur',async()=>{
  const old={project:process.env.FIREBASE_PROJECT_ID,test:process.env.BPD_TEST_FIXTURES,
    guild:process.env.DISCORD_GUILD_ID};
  process.env.FIREBASE_PROJECT_ID='belgiepd-test';
  process.env.BPD_TEST_FIXTURES='true';
  process.env.DISCORD_GUILD_ID=guild;
  try{
    const actor=await registeredActorForTestFixtures(user,
      [{dept:'politie',personId:'111111111111111111',name:'Test Beheerder'}],
      'politie',async()=>member());
    assert.equal(actor?.discordId,id);
    assert.equal(actor?.name,'Kader Tester (TEST)');
    assert.equal(actor?.dept,'politie');
    for(const userVariant of [
      {...user,uid:'google:user'}, {...user,dossierNativeDepartments:[]},
      {...user,departmentRoles:{politie:'basiskader'}},
      {...user,discordId:'not-an-id'}
    ])assert.equal(await registeredActorForTestFixtures(userVariant,[],'politie',async()=>member()),null);
    assert.equal(await registeredActorForTestFixtures(user,[],'ambulance',async()=>member()),null);
    assert.equal(await registeredActorForTestFixtures(user,[],'politie',async()=>({
      ...member(),guildId:'999999999999999999'})),null);
    assert.equal(await registeredActorForTestFixtures(user,[],'politie',async()=>({
      ...member(),verifiedAt:Date.now()-8*24*60*60*1000})),null);
    process.env.FIREBASE_PROJECT_ID='belgiepd-main';
    assert.equal(await registeredActorForTestFixtures(user,[],'politie',async()=>member()),null);
    process.env.FIREBASE_PROJECT_ID='belgiepd-test';
    process.env.BPD_TEST_FIXTURES='false';
    assert.equal(await registeredActorForTestFixtures(user,[],'politie',async()=>member()),null);
  }finally{
    for(const [key,value] of Object.entries({
      FIREBASE_PROJECT_ID:old.project,BPD_TEST_FIXTURES:old.test,DISCORD_GUILD_ID:old.guild
    })){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
test('Observaties en sancties zijn rechtstreekse tabbladacties, met rechtencontrole',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  assert.match(html,/id="formalWriteActions"/);
  assert.match(html,/id="addFormalObservation"/);
  assert.match(html,/id="addFormalSanction"/);
  assert.match(html,/function startFormalRegistration\(type\)/);
  assert.match(html,/data\.observationDepartments\?\.includes\(p\.dept\)/);
  assert.match(html,/data\.sanctionDepartments\?\.includes\(p\.dept\)/);
  assert.match(html,/Registraties zijn momenteel uitgeschakeld/);
  assert.match(html,/Je eigen Discord-identiteit is niet gekoppeld/);
  const src=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src);
  assert.doesNotThrow(()=>new Script(src.replace(/^import [^\n]*\n/gm,'')));
});
