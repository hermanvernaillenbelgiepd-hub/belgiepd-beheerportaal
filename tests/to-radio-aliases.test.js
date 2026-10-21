import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSonoranName} from '../src/to-radio.js';
import {serviceForCategory,TO_CATEGORIES,TO_SERVICE_GROUPS} from '../public/to-categories.js';
import {enrichRadioSnapshot,radioLabelInput,validRadioId,
  radioLabelWritesEnabled,mayEditRadioLabel} from '../src/to-radio-label-policy.js';
const raw=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const police=role=>({role,departments:['politie'],departmentRoles:{politie:role}});
test('MONITOR TO T.O. COBRA REPA are police; OPLEIDING has independent service',()=>{
  for(const label of ['MONITOR','TO','T.O.','COBRA','REPA']){
    assert.ok(TO_CATEGORIES.includes(label));
    assert.equal(serviceForCategory(label).id,'politie');
    assert.equal(parseSonoranName(label+' | Kader').category,label);
    const numbered=parseSonoranName(label+'-201 | Agent');
    assert.equal(numbered.category,label);
    assert.equal(numbered.number,'201');
    assert.equal(numbered.importable,true);
  }
  assert.ok(TO_SERVICE_GROUPS.some(x=>x.id==='opleiding'&&x.label==='Opleiding'));
  assert.equal(serviceForCategory('OPLEIDING').id,'opleiding');
  assert.equal(parseSonoranName('OPLEIDING | Instructeur').category,'OPLEIDING');
  assert.equal(serviceForCategory('LSRA').id,'depannage');
  assert.equal(serviceForCategory('BWM').id,'brandweer');
  assert.equal(serviceForCategory('AMB').id,'ambulance');
});
test('Aliases alter only portal presentation, never Sonoran operational identity',()=>{
  const id='radio_'+'a'.repeat(32);
  const user={id,name:'COBRA-201 | Test',displayName:'Test',category:'COBRA',number:'201',
    importable:true,notAvailable:true,paired:false,channel:'10'};
  const snapshot={connected:true,users:[user],counts:{online:1,recognized:1}};
  const result=enrichRadioSnapshot(snapshot,[{id,alias:'K9 ondersteuning'}]);
  assert.equal(result.users[0].portalAlias,'K9 ondersteuning');
  for(const key of ['name','displayName','category','number','importable','notAvailable','paired','channel'])
    assert.equal(result.users[0][key],user[key],key);
  assert.equal(user.portalAlias,undefined,'Raw source remains untouched');
  assert.equal(enrichRadioSnapshot(snapshot,[{id:'radio_'+'b'.repeat(32),alias:'Verkeerd'}]).users[0].portalAlias,null);
  assert.equal(validRadioId(id),true);
  assert.equal(validRadioId('radio_fake'),false);
});
test('Radio names require cadre and isolated TEST approval to save',()=>{
  assert.equal(mayEditRadioLabel(police('middenkader')),true);
  assert.equal(mayEditRadioLabel(police('officierenkader')),true);
  assert.equal(mayEditRadioLabel(police('basiskader')),false);
  assert.equal(mayEditRadioLabel({...police('officierenkader'),departmentRoles:{politie:'basiskader'}}),false);
  assert.equal(radioLabelWritesEnabled({}),false);
  assert.equal(radioLabelWritesEnabled({FIREBASE_PROJECT_ID:'prod',BPD_ENABLE_TO_RADIO_LABEL_WRITES:'true'}),false);
  assert.equal(radioLabelWritesEnabled({FIREBASE_PROJECT_ID:'belgiepd-test',BPD_ENABLE_TO_RADIO_LABEL_WRITES:'true'}),true);
  assert.equal(radioLabelInput('  Monitor   01 '),'Monitor 01');
  assert.equal(radioLabelInput(''),null);
  for(const x of ['a','x'.repeat(81),'bad<script>','A\nB',33])assert.throws(()=>radioLabelInput(x));
});
test('TO client supports a manual alias but does not issue Sonoran writes',()=>{
  const client=raw('public/to-dienstbord.js'),route=raw('src/to-radio-routes.js');
  assert.ok(client.includes('radio-edit-label'));
  assert.ok(client.includes("type==='radio-label'"));
  assert.ok(client.includes("'/api/to/radio/label'"));
  assert.ok(client.includes('portalAlias'));
  assert.ok(route.includes("app.post('/api/to/radio/label',requireUser"));
  assert.ok(route.includes("radioLabelWritesEnabled(process.env)"));
  assert.ok(route.includes("current.users.some(u=>u.id===id)"));
  assert.ok(route.includes('bpd_radio_label_audit'));
  assert.ok(!route.includes('set-user-display-name'));
  assert.ok(!route.includes('setUserDisplayName'));
});
