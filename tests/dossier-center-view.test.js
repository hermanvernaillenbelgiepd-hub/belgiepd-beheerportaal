import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDossiers,dossierStats,paginateDossiers,filterTimeline,PAGE_SIZE}
  from '../public/dossiercentrum-view.js';

const people=[
  {dept:'politie',discordId:'111111111111111111',name:'Émile Vermeulen',
    rank:'Inspecteur',call:'P-101',status:'Actief',personnel:true,application:false,
    applicationStatus:null},
  {dept:'ambulance',discordId:'222222222222222222',name:'Test Ambulance',
    rank:'Ambulancier',call:'A-22',status:'In opleiding',personnel:true,
    application:true,applicationStatus:'reviewing'},
  {dept:'brandweer',discordId:'333333333333333333',name:'Kandidaat Brandweer',
    rank:null,call:null,status:null,personnel:false,application:true,
    applicationStatus:'submitted'},
  {dept:'depannage',discordId:'444444444444444444',name:'Andere kandidaat',
    rank:null,call:null,status:null,personnel:false,application:true,
    applicationStatus:'rejected'}
];
test('Combined filters never add records outside the supplied authorised rows',()=>{
  assert.equal(filterDossiers(people,{department:'politie'}).length,1);
  assert.equal(filterDossiers(people,{kind:'personnel'}).length,2);
  assert.equal(filterDossiers(people,{kind:'application'}).length,3);
  assert.equal(filterDossiers(people,{kind:'both'}).length,1);
  assert.equal(filterDossiers(people,{applicationStatus:'reviewing'}).length,1);
  assert.equal(filterDossiers(people,{department:'ambulance',kind:'both',
    applicationStatus:'reviewing'}).length,1);
  assert.deepEqual(filterDossiers(people,{department:'politie',
    applicationStatus:'reviewing'}),[]);
  assert.deepEqual(filterDossiers([], {query:'kandidaat'}),[]);
});
test('Search handles diacritics, case, callsigns, rank, and ID',()=>{
  assert.equal(filterDossiers(people,{query:'emile'}).length,1);
  assert.equal(filterDossiers(people,{query:'  ÉMILE '}).length,1);
  assert.equal(filterDossiers(people,{query:'inspecteur'}).length,1);
  assert.equal(filterDossiers(people,{query:'p-101'}).length,1);
  assert.equal(filterDossiers(people,{query:'3333333333'}).length,1);
  assert.equal(filterDossiers(people,{query:'in opleiding'}).length,1);
  assert.equal(filterDossiers(people,{query:'missing'}).length,0);
});
test('Stats cover only the allowed rows, including intersecting dossiers',()=>{
  assert.deepEqual(dossierStats(people),{
    total:4,personnel:2,applications:3,both:1
  });
  assert.deepEqual(dossierStats(people.slice(0,1)),{
    total:1,personnel:1,applications:0,both:0
  });
});
test('Pagination is bounded and clamps unsupported input',()=>{
  assert.equal(PAGE_SIZE,25);
  const data=Array.from({length:57},(_,i)=>({id:i}));
  const p=paginateDossiers(data,2);
  assert.deepEqual([p.page,p.pages,p.total,p.rows.length,p.rows[0].id],[2,3,57,25,25]);
  const last=paginateDossiers(data,999);
  assert.equal(last.page,3);assert.equal(last.rows.length,7);
  assert.equal(paginateDossiers([],3).pages,1);
  assert.equal(paginateDossiers(data,1,9999).rows.length,57);
});
test('Timeline filters are read-only, including citizen history',()=>{
  const entries=[
    {kind:'burger',action:'citizen_registered'},
    {kind:'loopbaan',action:'promotion'},
    {kind:'sollicitatie',action:'accepted'},
    {kind:'personeel',action:'edit'}];
  assert.equal(filterTimeline(entries,'burger').length,1);
  assert.equal(filterTimeline(entries,'sollicitatie')[0].action,'accepted');
  assert.deepEqual(filterTimeline(entries,'all'),entries);
  assert.deepEqual(filterTimeline([], 'burger'),[]);
});
