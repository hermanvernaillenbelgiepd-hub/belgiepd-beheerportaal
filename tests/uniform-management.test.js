import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUniformLayout,validateUniformNameplate,UNIFORM_VARIANTS} from '../src/uniform-management-routes.js';

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

test('nameplates can be positioned independently for every service',()=>{
 const police=validateUniformNameplate({...sample,left:10.25,top:56.2,width:27.75,height:13.15});
 assert.equal(police.key,'politie_silver');
 assert.equal(police.left,10.25);
 const gold=validateUniformNameplate({...sample,variant:'gold',left:21.2,top:58.9,width:20.1,height:12.1});
 assert.equal(gold.key,'politie_gold');
 for(const department of ['brandweer','ambulance','depannage','burger']){
  const plate=validateUniformNameplate({...sample,department,variant:'default',
   left:11,top:55,width:27,height:12});
  assert.equal(plate.key,department+'_default');
 }
});
test('nameplate placement rejects invalid sizes and privilege fields',()=>{
 assert.throws(()=>validateUniformNameplate({...sample,left:96,width:12}),/binnen het uniform/);
 assert.throws(()=>validateUniformNameplate({...sample,height:1}),/binnen het uniform/);
 assert.throws(()=>validateUniformNameplate({...sample,role:'beheerder'}),/Ongeldige/);
 assert.throws(()=>validateUniformNameplate({...sample,reason:'kort'}),/Motivering/);
});
