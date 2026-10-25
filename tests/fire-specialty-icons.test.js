import test from 'node:test';
import assert from 'node:assert/strict';
import {fireSpecialtyMeta,fireSpecialtyKey,fireSpecialtyStatusClass,renderFireSpecialties}
  from '../public/fire-specialty-icons.js';

test('All requested fire specialty labels have their own icon',()=>{
  const wanted=[
    ['LADDERWAGEN','Ladderwagen','ladder'],
    ['LOGISTIEK','Logistiek','boxes'],
    ['SIGNALISATIE','Signalisatie','cone'],
    ['DUIKER','Duiker','waves'],
    ['RED-TEAM','RED-TEAM','shield'],
    ['GEVAARLIJKE STOFFEN','Gevaarlijke stoffen','biohazard'],
    ['BASIS TRAINING','Basis training','graduation']
  ];
  for(const [input,label,icon] of wanted){
    assert.deepEqual({...fireSpecialtyMeta(input),emoji:undefined}.label,label);
    assert.equal(fireSpecialtyMeta(input).icon,icon);
  }
  assert.equal(fireSpecialtyMeta('Basis TR').label,'Basis training');
  assert.equal(fireSpecialtyMeta('Basistraining').label,'Basis training');
  assert.equal(fireSpecialtyMeta('RED team').label,'RED-TEAM');
  assert.equal(fireSpecialtyMeta('Grote Boot').label,'Grote Boot');
  assert.equal(fireSpecialtyKey('  RED-TEAM '),'redteam');
});
test('Fire specialty status colors reflect stored status, not icon or course label',()=>{
  assert.equal(fireSpecialtyStatusClass('JA'),'is-yes');
  assert.equal(fireSpecialtyStatusClass('STAGE'),'is-stage');
  assert.equal(fireSpecialtyStatusClass('DOCENT'),'is-docent');
  assert.equal(fireSpecialtyStatusClass('RESTRICTED'),'is-warning');
  assert.equal(fireSpecialtyStatusClass('INACTIEF'),'is-off');
  assert.equal(fireSpecialtyStatusClass('NEE'),'is-neutral');
});
test('Renderer uses text nodes, preserves stored values, and supports compact view',()=>{
  // Small DOM stub keeps this test dependency-free and prevents HTML injection.
  const previous=globalThis.document;
  const makeElement=tag=>({
    tag,children:[],attrs:{},className:'',textContent:'',
    append(...nodes){this.children.push(...nodes)},
    setAttribute(key,value){this.attrs[key]=value},
    replaceChildren(...nodes){this.children=[...nodes]}
  });
  globalThis.document={
    createElement:makeElement,
    createElementNS:(_ns,tag)=>makeElement(tag)
  };
  try{
    const el=makeElement('div');
    const specialties=[
      {label:'RED team',value:'JA'},
      {label:'Gevaarlijke stoffen',value:'RESTRICTED'},
      {label:'<img src=x onerror=alert(1)>',value:'NEE'}
    ];
    const serialized=JSON.stringify(specialties);
    renderFireSpecialties(el,specialties,{compact:true});
    assert.equal(el.children.length,1);
    const list=el.children[0];
    assert.equal(list.children.length,3);
    assert.match(list.className,/is-compact/);
    assert.equal(list.children[0].children[0].children[1].textContent,'RED-TEAM');
    assert.match(list.children[0].children[1].className,/is-yes/);
    assert.equal(list.children[1].children[1].textContent,'RESTRICTED');
    assert.equal(list.children[2].children[0].children[1].textContent,
      '<img src=x onerror=alert(1)>');
    assert.equal(JSON.stringify(specialties),serialized);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous}
});
