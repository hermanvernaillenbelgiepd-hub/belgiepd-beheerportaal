import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisualLayer} from '../src/visual-layer-routes.js';

const normal={department:'brandweer',variant:'default',kind:'helmet',
 code:'default',left:22,top:3,width:50,height:32,zIndex:9,
 visible:true,reason:'Helm goedgekeurd voor de brandweer'};
test('uniform layers remain visual data and do not grant badges or medals',()=>{
 const item=validateVisualLayer(normal);
 assert.equal(item.key,'helmet_brandweer_default_v_default');
 assert.equal(item.assetKey,'helmet_brandweer_default');
 assert.equal(Object.hasOwn(item,'role'),false);
 assert.equal(Object.hasOwn(item,'awarded'),false);
 assert.equal(validateVisualLayer({...normal,department:'politie',variant:'gold'}).variant,'gold');
 assert.equal(validateVisualLayer({...normal,kind:'medal',code:'dienstmedaille'}).assetKey,
  'medal_brandweer_dienstmedaille');
});
test('visual layers support future security category without new service roles',()=>{
 const item=validateVisualLayer({...normal,department:'beveiliging',kind:'pictogram'});
 assert.equal(item.key,'pictogram_beveiliging_default_v_default');
});
test('visual layers reject unauthorized semantic fields and unsafe positioning',()=>{
 for(const update of [
  {department:'unknown'},{variant:'main'},{kind:'staff_role'},
  {code:'../../file'},{width:0},{width:99},{top:99},
  {left:NaN},{zIndex:99},{visible:'yes'},{reason:'kort'},
  {permissions:['admin']},{awardTo:'person-123'}
 ]){
  assert.throws(()=>validateVisualLayer({...normal,...update}));
 }
});
