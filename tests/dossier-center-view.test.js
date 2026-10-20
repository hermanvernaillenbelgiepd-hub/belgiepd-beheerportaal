import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDossiers,dossierStats,paginateDossiers,filterTimeline,PAGE_SIZE}
  from '../public/dossiercentrum-view.js';
const rows=[
  {dept:'politie',discordId:'111111111111111111',name:'Émile Vermeulen',rank:'Inspecteur',
    call:'P-101',status:'Actief',personnel:true},
  {dept:'ambulance',discordId:'222222222222222222',name:'Andere medewerker',
    rank:'Ambulancier',call:'A-21',status:'In opleiding',personnel:true}
];
test('Only staff within the authorised input is searchable',()=>{
  assert.equal(filterDossiers(rows,{query:'Emile'}).length,1);
  assert.equal(filterDossiers(rows,{query:'  ÉMILE '}).length,1);
  assert.equal(filterDossiers(rows,{query:'P-101'}).length,1);
  assert.equal(filterDossiers(rows,{department:'ambulance'}).length,1);
  assert.equal(filterDossiers(rows,{department:'brandweer'}).length,0);
  assert.equal(filterDossiers(rows,{query:'Inspecteur',department:'ambulance'}).length,0);
  assert.deepEqual(filterDossiers([],{query:'Emile'}),[]);
  assert.equal(filterDossiers([{dept:'politie',personnel:false,name:'Burger'}]).length,0);
});
test('Stats never count non-personnel records',()=>{
  assert.deepEqual(dossierStats([...rows,{personnel:false}]),{
    total:2,personnel:2,applications:0,both:0});
});
test('Pagination remains bounded',()=>{
  assert.equal(PAGE_SIZE,25);
  const data=Array.from({length:57},(_,i)=>({id:i}));
  const x=paginateDossiers(data,2);
  assert.deepEqual([x.page,x.pages,x.rows.length,x.rows[0].id],[2,3,25,25]);
  assert.equal(paginateDossiers(data,999).rows.length,7);
});
test('Only staff timeline types remain',()=>{
  const items=[{kind:'personeel'},{kind:'loopbaan'},{kind:'burger'}];
  assert.equal(filterTimeline(items,'personeel').length,1);
  assert.equal(filterTimeline(items,'loopbaan').length,1);
  assert.deepEqual(filterTimeline(items,'all'),items);
  assert.deepEqual(filterTimeline(items,'burger'),items);
});
