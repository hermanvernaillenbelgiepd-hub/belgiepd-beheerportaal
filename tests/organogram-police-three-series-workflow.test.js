import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {serviceHierarchy,policeWorkflowGroups,policeWorkflowSeriesNumber,
  policeMiddleColumns} from '../public/assets/organogram-hierarchie-model.js';

const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/police-organogram-workflow.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/police-organogram-workflow.css',import.meta.url),'utf8');

const fixture=[
 {dept:'politie',name:'KL',call:'900',series:'Reeks 2'},
 {dept:'politie',name:'OK',call:'930',series:'Reeks 1'},
 {dept:'politie',name:'R1 700',call:'710',series:'Reeks 1'},
 {dept:'politie',name:'R1 600',call:'610',series:'Reeks 1'},
 {dept:'politie',name:'R2 MK',call:'720',series:'Reeks 2'},
 {dept:'politie',name:'R3 800',call:'830',series:'Reeks 3'},
 {dept:'politie',name:'R1 BK',call:'520',series:'Reeks 1'},
 {dept:'politie',name:'R2 BK',call:'410',series:'R2'},
 {dept:'politie',name:'R3 AK',call:'200',series:'3'},
 {dept:'politie',name:'No assignment BK',call:'440',series:''},
 {dept:'politie',name:'Reserve MK',call:'620',series:'Reeks 4'},
 {dept:'politie',name:'Verified head',call:'700',series:'',
  reekshoofdReeks:'Reeks 3'}
];
const roster=serviceHierarchy(fixture,'politie');

test('three workflow columns use ONLY official personnel series',()=>{
 for(const value of ['Reeks 1','reeks 01','R1','1','Serie 1','Series 1'])
  assert.equal(policeWorkflowSeriesNumber(value),1);
 assert.equal(policeWorkflowSeriesNumber('R02'),2);
 assert.equal(policeWorkflowSeriesNumber('Reeks 3'),3);
 for(const invalid of ['',null,'Reeks 4','VLINDER','700','610','xReeks 1'])
  assert.equal(policeWorkflowSeriesNumber(invalid),null);
 const grouped=policeWorkflowGroups(roster.leadership);
 assert.deepEqual(grouped['1'].Middenkader.map(p=>p.call),['710','610']);
 assert.deepEqual(grouped['2'].Middenkader.map(p=>p.call),['720']);
 assert.deepEqual(grouped['3'].Middenkader.map(p=>p.call),['830','700']);
 assert.deepEqual(grouped['1'].Basiskader.map(p=>p.call),['520']);
 assert.deepEqual(grouped['2'].Basiskader.map(p=>p.call),['410']);
 assert.deepEqual(grouped['3'].Agentenkader.map(p=>p.call),['200']);
 assert.deepEqual(grouped.unassigned.Basiskader.map(p=>p.call),['440']);
 assert.deepEqual(grouped.unassigned.Middenkader.map(p=>p.call),['620']);
 const placed=Object.values(grouped).flatMap(group=>
  Object.values(group).flatMap(members=>members));
 assert.equal(placed.length,fixture.length-2); // exclude KL and OK
 assert.equal(new Set(placed).size,placed.length);
 assert.equal(policeMiddleColumns(grouped['1'].Middenkader)['700'].length,1);
 assert.equal(policeMiddleColumns(grouped['1'].Middenkader)['600'].length,1);
});

function fakeNode(tag,cls='',text=''){
 return {tag,cls,text,children:[],dataset:{},open:false,attributes:{},
  append(...parts){this.children.push(...parts)},
  setAttribute(k,v){this.attributes[k]=v},
  addEventListener(){}};
}
function flatten(node){
 return [node,...(node.children||[]).flatMap(flatten)];
}
test('police workflow renders command first, then three equal peer series',()=>{
 // Standalone presentation module imports the already-tested model helpers.
 const source=js.replace(/^import \{[\s\S]*?\} from '\/assets\/organogram-hierarchie-model\.js';/m,'')
  .replace('export function buildPoliceWorkflow','function buildPoliceWorkflow');
 const sandbox={el:fakeNode,policeWorkflowGroups,policeWorkflowSeriesNumber,
  policeMiddleColumns,
  orderedPoliceMiddle:arr=>[...arr].sort((a,b)=>Number(a.call)-Number(b.call)),
  orderedSpecialtyMembers:arr=>[...arr]};
 runInNewContext(source+';this.builder=buildPoliceWorkflow',sandbox);
 const deps={el:fakeNode,person:p=>fakeNode('button','person',p.call),
  cadrePeopleList:members=>fakeNode('div','personnel',String(members.length)),
  policeInterventions:()=>fakeNode('details','police-intervention-group'),
  middleCadreLayout:()=>fakeNode('div','middle-cadre'),
  state:{cadreOpen:{},serviceOpen:{},demo:false},managerReady:false,
  syncCadreToggle(){}};
 const flow=sandbox.builder(roster,deps);
 const descendants=flatten(flow);
 const firstStages=flow.children.filter(c=>c.cls.includes('police-workflow-top'));
 assert.deepEqual(firstStages.map(x=>x.children[0].children[0].text),
  ['Korpsleiding','Officierenkader']);
 const grid=descendants.find(x=>x.cls==='police-workflow-series-grid');
 assert.ok(grid);
 assert.equal(grid.children.length,3);
 assert.deepEqual(grid.children.map(x=>x.dataset.series),['1','2','3']);
 const first=grid.children[0];
 const labels=flatten(first).filter(x=>x.cls==='level-title')
  .map(x=>x.children[0].text);
 assert.deepEqual(labels,['Middenkader','Basiskader','Agentenkader']);
 const roles=flatten(first).filter(x=>x.cls==='police-workflow-middle-label')
  .map(x=>x.text);
 assert.deepEqual(roles,['700 · Hoofdinspecteurs','600 · Aspirant-hoofdinspecteurs']);
 assert.ok(descendants.some(x=>x.cls==='police-workflow-unassigned'));
 assert.ok(descendants.some(x=>x.cls==='police-intervention-group'));
 assert.ok(!descendants.some(x=>x.cls==='police-workflow-order-tools'));
 const manager=sandbox.builder(roster,{...deps,managerReady:true});
 assert.ok(flatten(manager).some(x=>x.cls==='police-workflow-order-tools'));
});

test('MAIN document remains role-protected and routes only detailed police view',()=>{
 assert.match(page,/import \{buildPoliceWorkflow\} from '\/police-organogram-workflow\.js'/);
 assert.match(page,/police-organogram-workflow\.css/);
 assert.match(page,/series:p\.dept==='politie'\?String\(p\.series\|\|''\)\.slice\(0,36\):''/);
 assert.match(page,/if\(solo&&settings\.id==='politie'\)\{/);
 assert.match(page,/body\.append\(buildPoliceWorkflow\(item/);
 assert.match(page,/else for\(const level of item\.leadership\)/);
 assert.match(page,/if\(solo&&settings\.id!=='politie'\)/);
 assert.match(page,/authFetch\('\/api\/organogram\/hierarchie'\)/);
 assert.match(page,/if\(!state\.loaded&&!state\.demo\)/);
 assert.doesNotMatch(js,/fetch\(|authFetch\(|fetch\s*\(/);
 assert.doesNotMatch(js,/\bPOST\b|\bDELETE\b|\bPATCH\b/);
 assert.match(js,/managerReady&&!state\.demo/);
 assert.match(js,/middleCadreLayout\(levels\.get\('Middenkader'\)\|\|\[\]\)/);
});

test('widescreen uses 3 equal columns, mobile one, no hidden staff records',()=>{
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media \(max-width:1100px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.police-workflow-people/);
 assert.match(css,/html\[data-bpd-theme="light"\]/);
 assert.doesNotMatch(css,/\.person\s*\{[^}]*display:none/);
 assert.match(js,/Overige \/ niet ingedeeld/);
});

test('both JavaScript modules and original inline UI remain valid ES modules',()=>{
 for(const source of [js,page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]]){
  assert.ok(source);
  const result=spawnSync(process.execPath,['--check','--input-type=module'],
   {input:source,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }
});

test('police REEKS cards fill the complete column and keep legible text',()=>{
 // Legacy cards have width:218px; specific workflow selectors MUST override it.
 assert.match(css,/#services \.police-workflow \.police-workflow-people\.personnel-card-grid > \.person \{/);
 assert.match(css,/display:grid;\s*grid-template-columns:28px 58px minmax\(0,1fr\)/);
 assert.match(css,/width:100%;\s*max-width:none;\s*min-width:0;/);
 assert.match(css,/> \.person > \.identity \{/);
 assert.match(css,/word-break:normal;\s*overflow-wrap:break-word/);
 assert.match(css,/\.person-role-flags \.flag \{[\s\S]*?white-space:nowrap/);
 assert.match(css,/\.police-workflow-head-tag \{[\s\S]*?white-space:nowrap/);
 assert.match(css,/@container \(max-width:280px\)/);
});
test('REEKSHOOFD label stays inside the name/rank column, not an extra grid child',()=>{
 const source=js.replace(/^import \{[\s\S]*?\} from '\/assets\/organogram-hierarchie-model\.js';/m,'')
  .replace('export function buildPoliceWorkflow','function buildPoliceWorkflow');
 const sandbox={el:fakeNode,policeWorkflowGroups,policeWorkflowSeriesNumber,
  policeMiddleColumns,orderedPoliceMiddle:arr=>[...arr],
  orderedSpecialtyMembers:arr=>[...arr]};
 runInNewContext(source+';this.builder=buildPoliceWorkflow',sandbox);
 const deps={el:fakeNode,person:person=>{
  const card=fakeNode('button','person',person.call);
  const identity=fakeNode('span','identity',person.name);
  card.append(identity);
  card.querySelector=selector=>selector==='.identity'?identity:null;
  return card;
 },cadrePeopleList:members=>fakeNode('div','personnel',String(members.length)),
  policeInterventions:()=>fakeNode('details','police-intervention-group'),
  middleCadreLayout:()=>fakeNode('div','middle-cadre'),
  state:{cadreOpen:{},serviceOpen:{},demo:false},managerReady:false,
  syncCadreToggle(){}};
 const flow=sandbox.builder(roster,deps);
 const cards=flatten(flow).filter(n=>n.tag==='button'&&n.cls==='person');
 const head=cards.find(n=>n.text==='700');
 assert.ok(head);
 assert.equal(head.children.length,1,'head tag must not be an extra card grid child');
 assert.deepEqual(head.children[0].children.map(n=>n.text),['REEKSHOOFD']);
 assert.match(js,/card\.querySelector\?\.\('\.identity'\)/);
});
