import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radioLabelWritesEnabled,validRadioId,radioLabelInput,
  enrichRadioSnapshot,mayEditRadioLabel} from '../src/to-radio-label-policy.js';

test('Naamcorrecties zijn alleen actief met expliciete Render-schakelaar en Firebase-project',()=>{
  const main={FIREBASE_PROJECT_ID:'belgiepd-main',BPD_ENABLE_TO_RADIO_LABEL_WRITES:'true'};
  const testEnv={FIREBASE_PROJECT_ID:'belgiepd-test',BPD_ENABLE_TO_RADIO_LABEL_WRITES:'true'};
  assert.equal(radioLabelWritesEnabled(main),true);
  assert.equal(radioLabelWritesEnabled(testEnv),true);
  assert.equal(radioLabelWritesEnabled({...main,BPD_ENABLE_TO_RADIO_LABEL_WRITES:'false'}),false);
  assert.equal(radioLabelWritesEnabled({...main,FIREBASE_PROJECT_ID:''}),false);
  assert.equal(radioLabelWritesEnabled({}),false);
});
test('Correctie blijft een displayalias en verandert de oorspronkelijke radiogegevens niet',()=>{
  const id='radio_'+'a'.repeat(32);
  assert.equal(validRadioId(id),true);
  assert.equal(radioLabelInput('  BOUILLE   DE BERLIN  '),'BOUILLE DE BERLIN');
  assert.equal(radioLabelInput(''),null);
  assert.throws(()=>radioLabelInput('<script>'));
  const raw={connected:true,users:[{id,name:'SANTO-600 | J.Eclaire',
    call:'SANTO-600',online:true}]};
  const result=enrichRadioSnapshot(raw,[{id,alias:'BOUILLE DE BERLIN'}]);
  assert.equal(result.users[0].portalAlias,'BOUILLE DE BERLIN');
  assert.equal(result.users[0].name,'SANTO-600 | J.Eclaire');
  assert.equal(result.users[0].call,'SANTO-600');
  assert.equal(result.users[0].online,true);
});
test('API en server bewaren vorige/nieuwe weergavenaam in audit en verhinderen Sonoran sync',()=>{
  const source=readFileSync(new URL('../src/to-radio-routes.js',import.meta.url),'utf8');
  assert.match(source,/mayEditRadioLabel\(req\.bpd\)/);
  assert.match(source,/radioLabelWritesEnabled\(process\.env\)/);
  assert.match(source,/validRadioId\(id\)/);
  assert.match(source,/u\.id===id&&u\.labelEditable===true/);
  assert.match(source,/previousAlias:old,nextAlias:alias/);
  assert.match(source,/bpd_radio_label_overrides_main/);
  assert.match(source,/bpd_radio_label_audit_main/);
  assert.match(source,/sonoranSynced:false/);
  assert.ok(!source.includes("FIREBASE_PROJECT_ID!=='belgiepd-test'"));
});
