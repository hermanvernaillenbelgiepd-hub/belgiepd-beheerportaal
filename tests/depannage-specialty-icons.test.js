import test from 'node:test';
import assert from 'node:assert/strict';
import {SPECIALTY_LABELS} from '../src/normalize.js';
import {depannageSpecialtyMeta,depannageSpecialtyRows,
 depannageStatusClass,renderDepannageSpecialties}
 from '../public/depannage-specialty-icons.js';

test('Depannage keeps legacy spreadsheet keys and accepts two new manual-only fields',()=>{
 assert.deepEqual(SPECIALTY_LABELS.depannage,
   ['Opleiding DEP2K','Opleiding FAST','CRANE','WEGENWERKEN']);
 assert.equal(depannageSpecialtyMeta('Opleiding DEP2K').label,'Depannage');
 assert.equal(depannageSpecialtyMeta('Opleiding FAST').label,'FAST');
 assert.equal(depannageSpecialtyMeta('CRANE').label,'CRANE');
 assert.equal(depannageSpecialtyMeta('WEGENWERKEN').label,'Wegenwerken');
});

test('Four Depannage fields preserve source statuses and do not invent qualifications',()=>{
 const data=[{label:'Opleiding FAST',value:'Nee'},
   {label:'Opleiding DEP2K',value:'Ja'}];
 const rows=depannageSpecialtyRows(data);
 assert.deepEqual(rows.map(x=>x.label),['Depannage','FAST','CRANE','Wegenwerken']);
 assert.deepEqual(rows.map(x=>x.value),['Ja','Nee','Niet ingevuld','Niet ingevuld']);
 assert.deepEqual(data,[{label:'Opleiding FAST',value:'Nee'},
   {label:'Opleiding DEP2K',value:'Ja'}]);
 const manuallyEntered=depannageSpecialtyRows([
   ...data,{label:'WEGENWERKEN',value:'Stage'},{label:'CRANE',value:'RESTRICTED'}
 ]);
 assert.deepEqual(manuallyEntered.map(x=>x.value),['Ja','Nee','RESTRICTED','Stage']);
 assert.equal(depannageStatusClass('Ja'),'is-yes');
 assert.equal(depannageStatusClass('Stage'),'is-stage');
 assert.equal(depannageStatusClass('RESTRICTED'),'is-warning');
 assert.equal(depannageStatusClass('Niet ingevuld'),'is-neutral');
});

test('Depannage icon renderer uses text nodes in a compact two-column list',()=>{
 const prior=globalThis.document;
 const el=tag=>({tag,children:[],attributes:{},className:'',textContent:'',
   setAttribute(k,v){this.attributes[k]=v},
   append(...nodes){this.children.push(...nodes)},
   replaceChildren(...nodes){this.children=[...nodes]}});
 globalThis.document={createElement:el,createElementNS:(_ns,tag)=>el(tag)};
 try{
   const root=el('section');
   renderDepannageSpecialties(root,[
     {label:'Opleiding DEP2K',status:'Ja'},
     {label:'Opleiding FAST',status:'Nee'}],{compact:true});
   assert.equal(root.children.length,1);
   const list=root.children[0];
   assert.match(list.className,/is-compact/);
   assert.equal(list.children.length,4);
   assert.deepEqual(list.children.map(c=>c.children[0].children[1].textContent),
     ['Depannage','FAST','CRANE','Wegenwerken']);
   assert.equal(list.children[0].children[0].children[0].children[0].tag,'svg');
   assert.equal(list.children[0].children[1].textContent,'Ja');
   assert.equal(list.children[2].children[1].textContent,'Niet ingevuld');
 }finally{if(prior===undefined)delete globalThis.document;
   else globalThis.document=prior}
});
