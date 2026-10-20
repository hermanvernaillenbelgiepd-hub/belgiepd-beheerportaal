import test from 'node:test';
import assert from 'node:assert/strict';
import {TO_SERVICE_GROUPS,TO_CATEGORIES,serviceForCategory,groupByTOService} from '../public/to-categories.js';
import {TO_CATEGORIES as boardCategories} from '../src/to-board-policy.js';

const expected={
  politie:['SANTO','BLAINE','WYCAN','FALCON','EAGLE','SIGMA','SIGNA','MARCAN','AIRCAN','CANINE','RAGO','MIKE','COMMAND'],
  brandweer:['BRANDWEER','BWM','BWV','BAMBU','BWAMBU','BW-AMBU','KORP','SERG','ADJ','LT','KAP','MAJ','KOL','ZONE','ZONE-COMM','PLOEG1','PLOEG2','PLOEG3'],
  ambulance:['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','AMBULANCE','AMBULANCE-MOTOR','PIT','MUG','MUGHELI','DIR-MED','SIT-TEAM'],
  depannage:['LSRA','DEPK','LSRA-DEPA100','LSRA-DEPAK200','LSRA-F.A.S.T.','LSRA-ANWV'],
  overige:[]
};

test('Every operational category belongs to exactly one ordered service shared with the backend',()=>{
  assert.deepEqual(TO_SERVICE_GROUPS.map(group=>group.id),Object.keys(expected));
  assert.deepEqual(TO_SERVICE_GROUPS.map(group=>group.label),['Politie','Brandweer','Ambulance','Depannage','Overige']);
  assert.equal(TO_CATEGORIES.length,51);
  assert.equal(new Set(TO_CATEGORIES).size,TO_CATEGORIES.length);
  assert.strictEqual(boardCategories,TO_CATEGORIES);
  for(const group of TO_SERVICE_GROUPS){
    assert.deepEqual(group.categories,expected[group.id]);
    for(const category of group.categories)assert.strictEqual(serviceForCategory(category),group);
  }
});

test('SANTO and BWM resolve by exact category while lookalike and unknown labels stay Other',()=>{
  assert.equal(serviceForCategory(' santo ').id,'politie');
  assert.equal(serviceForCategory('bwm').id,'brandweer');
  assert.equal(serviceForCategory('BWM').label,'Brandweer');
  for(const category of ['SANTO2','SANTO - 620','BWMOTOR','BWM620','LSRA-FxAxSxTx','',null,undefined,3,{}])
    assert.equal(serviceForCategory(category).id,'overige');
  for(const type of ['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB']){
    assert.equal(serviceForCategory(type).id,'ambulance',type);
  }
  assert.equal(serviceForCategory('HAMB123').id,'overige','Do not classify a whole numbered callsign as a permission');
  assert.equal(serviceForCategory('PLOEG1').id,'brandweer');
  assert.equal(serviceForCategory('LSRA-DEPA100').id,'depannage');
  for(const category of ['LSRA','DEPK'])assert.equal(serviceForCategory(category).id,'depannage',category);
  for(const category of ['BWM','BWV','KORP','SERG','ADJ','LT','KAP','MAJ','KOL','ZONE'])
    assert.equal(serviceForCategory(category).id,'brandweer',category);
});

test('Service grouping orders nonempty services while retaining item order and original inputs',()=>{
  const items=[{category:'MUG',id:'medical'},{category:'BWM',id:'fire-first'},
    {category:'ONBEKEND',id:'other-first'},{category:'SANTO',id:'police-first'},
    {category:'BLAINE',id:'police-second'},{category:'PLOEG1',id:'fire-second'},
    {category:'LSRA-ANWV',id:'recovery'},{category:null,id:'other-second'}];
  const before=structuredClone(items);
  const groups=groupByTOService(items);
  assert.deepEqual(groups.map(group=>group.id),Object.keys(expected));
  assert.deepEqual(groups.map(group=>group.items.map(item=>item.id)),[
    ['police-first','police-second'],['fire-first','fire-second'],['medical'],['recovery'],['other-first','other-second']
  ]);
  assert.deepEqual(items,before);
  assert.strictEqual(groups[0].items[0],items[3]);
  groups[0].items.pop();
  assert.deepEqual(items,before,'Returned grouping arrays do not modify the source array');
  assert.deepEqual(groupByTOService([]),[]);
  assert.deepEqual(groupByTOService([{category:'BWM'}]).map(group=>group.id),['brandweer']);
});

test('Saved crew grouping accepts an explicit category selector without renaming operational labels',()=>{
  const teams=[{dienst:'AMBULANCE-MOTOR',roepnaam:'620'},{dienst:'BWM',roepnaam:'620'},
    {dienst:'BRANDWEER',roepnaam:'620'},{dienst:'SANTO',roepnaam:'620'}];
  const groups=groupByTOService(teams,team=>team.dienst);
  assert.deepEqual(groups.map(group=>group.id),['politie','brandweer','ambulance']);
  assert.deepEqual(groups[1].items.map(team=>team.dienst),['BWM','BRANDWEER']);
  assert.equal(groups[1].categories.includes('BWM'),true);
});

test('Shared service and category definitions cannot be changed by a consumer',()=>{
  assert.equal(Object.isFrozen(TO_SERVICE_GROUPS),true);
  assert.equal(Object.isFrozen(TO_CATEGORIES),true);
  for(const group of TO_SERVICE_GROUPS){
    assert.equal(Object.isFrozen(group),true);
    assert.equal(Object.isFrozen(group.categories),true);
  }
  assert.throws(()=>TO_SERVICE_GROUPS.push({id:'test'}),TypeError);
  assert.throws(()=>serviceForCategory('SANTO').categories.push('BWM'),TypeError);
  assert.throws(()=>{serviceForCategory('BWM').label='Politie';},TypeError);
});
