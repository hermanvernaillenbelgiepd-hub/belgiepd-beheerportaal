import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {serviceHierarchy} from '../public/assets/organogram-hierarchie-model.js';
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const fakeNode=(tag,cls='',value='')=>({
 tag,cls,value,children:[],attributes:{},listeners:{},open:false,scrolls:[],
 append(...nodes){this.children.push(...nodes)},
 setAttribute(name,value){this.attributes[name]=value},
 addEventListener(event,fn){this.listeners[event]=fn},
 scrollBy(args){this.scrolls.push(args)},
});
const flatten=x=>[x,...x.children.flatMap(flatten)];
test('board and every cadre uses independently collapsible native details/summary',()=>{
 assert.match(html,/<details class="board" id="board-panel" open>/);
 assert.match(html,/<summary><strong>👑 BESTUUR<\/strong><\/summary>/);
 assert.match(js,/const block=el\('details','level'\)/);
 assert.match(js,/const heading=el\('summary','level-title'\)/);
 assert.match(js,/block\.open=state\.cadreOpen\[key\]\?\?true/);
 assert.match(js,/state\.cadreOpen\[key\]=block\.open/);
 const roster=serviceHierarchy([
  {dept:'politie',name:'KL',call:'900'},
  {dept:'politie',name:'OFF',call:'930'},
  {dept:'politie',name:'MK',call:'710'},
  {dept:'politie',name:'Basis',call:'510'},
  {dept:'politie',name:'Agent',call:'210'}
 ],'politie');
 assert.deepEqual(roster.leadership.map(x=>x.label),[
  'Korpsleiding','Officierenkader','Middenkader','Basiskader','Agentenkader']);
});
test('all police specializations occupy one horizontal flex row with a visible scrollbar',()=>{
 assert.match(html,/\.police-intervention-group \.police-specialty-grid\{[\s\S]*?display:flex;flex-wrap:nowrap/);
 assert.match(html,/overflow-x:auto;overflow-y:hidden/);
 assert.match(html,/scroll-snap-type:x proximity/);
 assert.match(html,/\.police-intervention-group \.police-specialty-grid>\.specialty\[open\]/);
 assert.doesNotMatch(html,/\.police-specialty-grid\{display:grid/);
});
test('specialization row is horizontally scrollable by accessible left and right buttons',()=>{
 const start=js.indexOf('function policeInterventions(');
 const stop=js.indexOf('function canDragMiddle(',start);
 assert.ok(start>0&&stop>start);
 const state={specializationsOpen:true};
 const ctx={el:fakeNode,state,
  specialtyBranch:(branch)=>fakeNode('details','specialty',branch.label)};
 runInNewContext(js.slice(start,stop)+';this.builder=policeInterventions;',ctx);
 const labels=['INTERVENTIEDIENST','SIGNALISATIE','MOTARD','SEMI ANONIEM','K9',
  'RAGO','DISP','TO','AE','RECHERCHE'];
 const section=ctx.builder(labels.map(label=>({label,members:[]})));
 assert.equal(section.tag,'details');
 assert.equal(section.open,true);
 const dom=flatten(section);
 const strip=dom.find(n=>n.cls==='spec-list police-specialty-grid');
 assert.ok(strip);
 assert.deepEqual(strip.children.map(x=>x.value),labels);
 assert.equal(strip.attributes['aria-label'],'Horizontale rij politiespecialisaties');
 const buttons=dom.filter(n=>n.tag==='button');
 assert.equal(buttons.length,2);
 assert.equal(buttons[0].attributes['aria-label'],'Vorige specialisaties');
 assert.equal(buttons[1].attributes['aria-label'],'Volgende specialisaties');
 strip.clientWidth=900;
 buttons[1].listeners.click();
 buttons[0].listeners.click();
 assert.deepEqual(strip.scrolls.map(x=>x.left),[675,-675]);
 section.open=false;section.listeners.toggle();
 assert.equal(state.specializationsOpen,false);
});
test('specialty details default collapsed but remember user choice and other services stay open',()=>{
 const begin=js.indexOf('function specialtyBranch(');
 const end=js.indexOf('function filteredRows(',begin);
 const state={specialtyOpen:{}};
 const ctx={el:fakeNode,state,isSpecialtyInstructor:()=>false,isTeacher:()=>false,
  peopleList:(rows)=>fakeNode('list','persons',String(rows.length))};
 runInNewContext(js.slice(begin,end)+';this.builder=specialtyBranch;',ctx);
 const opened=ctx.builder({label:'MOTARD',members:[]},true);
 assert.equal(opened.tag,'details');
 assert.equal(opened.open,false);
 opened.open=true;opened.listeners.toggle();
 assert.equal(state.specialtyOpen.MOTARD,true);
 const again=ctx.builder({label:'MOTARD',members:[]},true);
 assert.equal(again.open,true);
 const fire=ctx.builder({label:'Duiker',members:[]},false);
 assert.equal(fire.open,true);
});
test('cadres, instructor restrictions, drag controls and rollback remain unaffected',()=>{
 assert.match(js,/block\.append\(levelBody\)/);
 assert.match(js,/levelBody\.append\(middleCadreLayout\(level\.members\)\)/);
 assert.match(js,/levelBody\.append\(policeInterventions\(item\.branches\)\)/);
 assert.match(html,/police-specialty-role-grid/);
 assert.match(js,/isSpecialtyInstructor\(p,branch\.label\)/);
 assert.match(js,/canDragMiddle\(p,series\)/);
 assert.match(html,/id="manage-undo"/);
 assert.match(js,/undoLastMiddleDrag/);
 assert.match(html,/Klassiek organogram/);
 assert.match(html,/organogram-police-formal\.js/);
 assert.doesNotThrow(()=>new Script(js.replace(/^import[^\n]+\n/m,'')));
});
