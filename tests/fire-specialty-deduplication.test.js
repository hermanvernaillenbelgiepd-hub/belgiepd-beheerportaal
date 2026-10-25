import test from 'node:test';
import assert from 'node:assert/strict';
import {SPECIALTY_LABELS} from '../src/normalize.js';
import {publicSpecializations} from '../src/specialization-policy.js';
import {uniqueFireSpecialties,renderFireSpecialties,fireSpecialtyMeta}
  from '../public/fire-specialty-icons.js';

test('Brandweer RED team and Basis TR appear only once in the canonical catalog',()=>{
 const labels=SPECIALTY_LABELS.brandweer;
 assert.equal(labels.filter(x=>fireSpecialtyMeta(x).label==='RED-TEAM').length,1);
 assert.equal(labels.filter(x=>fireSpecialtyMeta(x).label==='Basis training').length,1);
 assert.ok(labels.includes('RED team'));
 assert.ok(labels.includes('Basis TR'));
 assert.ok(!labels.includes('RED-TEAM'));
 assert.ok(!labels.includes('Basistraining'));
});

test('Old manually entered RED-TEAM and Basistraining values survive alias removal',()=>{
 const subject={dept:'brandweer',specialties:[
  {label:'RED team',value:'Ja'},{label:'Basis TR',value:'Ja'}
 ]};
 const normal=publicSpecializations(subject,{});
 assert.deepEqual(normal.items.filter(x=>x.label==='RED team').map(x=>x.value),['Ja']);
 const saved=publicSpecializations(subject,{revision:3,values:{
  'RED-TEAM':{source:'manual',value:'Nee'},
  'Basistraining':{source:'manual',value:'Stage'}
 }});
 assert.deepEqual(saved.items.filter(x=>x.label==='RED team').map(x=>x.value),['Nee']);
 assert.deepEqual(saved.items.filter(x=>x.label==='Basis TR').map(x=>x.value),['Stage']);
 assert.equal(saved.revision,3);
 const overridden=publicSpecializations(subject,{values:{
  'RED-TEAM':{source:'manual',value:'Nee'},
  'RED team':{source:'manual',value:'Ja'}
 }});
 assert.equal(overridden.items.find(x=>x.label==='RED team').value,'Ja',
   'Newer canonical key has precedence');
});

test('Legacy duplicates render as one RED-TEAM with real Ja status',()=>{
 const raw=[
  {label:'RED team',value:'Ja',source:'google-sheets'},
  {label:'RED-TEAM',value:'Niet ingevuld',source:'google-sheets'},
  {label:'Basis TR',value:'Ja',source:'google-sheets'},
  {label:'Basistraining',value:'Niet ingevuld',source:'google-sheets'}
 ];
 const dedup=uniqueFireSpecialties(raw);
 assert.equal(dedup.length,2);
 assert.deepEqual(dedup.map(x=>x.value),['Ja','Ja']);
 assert.equal(raw.length,4,'Source records are untouched');
 const manual=uniqueFireSpecialties([
  raw[0],{label:'RED-TEAM',value:'Nee',source:'manual'}
 ]);
 assert.equal(manual.length,1);
 assert.equal(manual[0].value,'Nee','A deliberate manual status takes priority');
});

test('The actual icon renderer shows one visible RED-TEAM badge',()=>{
 const old=globalThis.document;
 const el=tag=>({
  tag,children:[],attrs:{},textContent:'',className:'',
  setAttribute(k,v){this.attrs[k]=v},
  append(...nodes){this.children.push(...nodes)},
  replaceChildren(...nodes){this.children=[...nodes]}
 });
 globalThis.document={createElement:el,createElementNS:(_ns,tag)=>el(tag)};
 try{
  const root=el('div');
  renderFireSpecialties(root,[
   {label:'RED team',value:'Ja'},
   {label:'RED-TEAM',value:'Niet ingevuld'},
   {label:'Basis TR',value:'Ja'},
   {label:'Basistraining',value:'Niet ingevuld'}
  ],{compact:true});
  const rows=root.children[0].children;
  assert.equal(rows.length,2);
  assert.equal(rows[0].children[0].children[1].textContent,'RED-TEAM');
  assert.equal(rows[0].children[1].textContent,'Ja');
  assert.equal(rows[1].children[0].children[1].textContent,'Basis training');
 }finally{
  if(old===undefined)delete globalThis.document;
  else globalThis.document=old;
 }
});
