import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUniformLayout,UNIFORM_VARIANTS} from '../src/uniform-management-routes.js';

const sample={department:'politie',variant:'silver',
 left:62.3,top:56.75,width:26.6,height:12.25,reason:'Aangepast na controle van de uniformfoto'};
test('police silver and gold uniform coordinates stay independent',()=>{
 assert.deepEqual(UNIFORM_VARIANTS.politie,['silver','gold']);
 assert.deepEqual(UNIFORM_VARIANTS.brandweer,['default']);
 const output=validateUniformLayout(sample);
 assert.equal(output.key,'politie_silver');
 assert.equal(output.left,62.3);
 assert.equal(validateUniformLayout({...sample,variant:'gold'}).key,'politie_gold');
});
test('each service can position a grade plate independently',()=>{
 for(const department of ['brandweer','ambulance','depannage','burger']){
  const r=validateUniformLayout({...sample,department,variant:'default'});
  assert.equal(r.key,department+'_default');
 }
});
test('invalid placement, variant and unmotivated changes are rejected',()=>{
 assert.throws(()=>validateUniformLayout({...sample,left:100}),/binnen het uniform/);
 assert.throws(()=>validateUniformLayout({...sample,width:0}),/volledig binnen/);
 assert.throws(()=>validateUniformLayout({...sample,top:99}),/binnen het uniform/);
 assert.throws(()=>validateUniformLayout({...sample,left:NaN}),/tussen 0 en 100/);
 assert.throws(()=>validateUniformLayout({...sample,variant:'admin'}),/Onbekende/);
 assert.throws(()=>validateUniformLayout({...sample,department:'niet-bestaand'}),/Onbekende/);
 assert.throws(()=>validateUniformLayout({...sample,reason:'kort'}),/Motivering/);
 assert.throws(()=>validateUniformLayout({...sample,permissions:['korpsleiding']}),/Ongeldige/);
});
