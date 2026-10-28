import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {serviceHierarchy,orderedSpecialtyMembers,policeSpecialtyName}
 from '../public/assets/organogram-hierarchie-model.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const mk=(call,props={})=>({dept:'politie',call:String(call),
 name:'Voorbeeld '+call,rank:Number(call)>=500?'Eerste inspecteur':'Inspecteur',
 specialties:['INTERVENTIEDIENST'],teachingRoles:[],...props});
test('intervention is a peer of other specializations, with radio/BM included',()=>{
 const p=serviceHierarchy([
  mk(500),mk(501,{specialties:['RADIO/BM'],teachingRoles:['instructeur']}),
  mk(400,{specialties:['INTERVENTIEDIENST','Radio BM']}),
  mk(401),mk(420,{specialties:['Motard']})
 ],'politie');
 assert.deepEqual(p.branches.slice(0,10).map(x=>x.label),[
  'INTERVENTIEDIENST','SIGNALISATIE','MOTARD','SEMI ANONIEM',
  'K9','RAGO','DISP','TO','AE','RECHERCHE']);
 const intervention=p.branches[0];
 assert.equal(intervention.note,'RADIO/BM inbegrepen');
 assert.equal(intervention.children,undefined);
 assert.deepEqual(orderedSpecialtyMembers(intervention.members).map(p=>p.call),[
  '500','501','400','401']);
 assert.equal(intervention.members.filter(p=>p.call==='400').length,1);
 assert.deepEqual(p.branches[2].members.map(p=>p.call),['420']);
 assert.equal(p.branches.some(b=>b.label==='RADIO/BM'),false);
 assert.equal(policeSpecialtyName('SIV/WPR'),'SIGNALISATIE');
});
test('instructors are shown first, then every eligible member by actual rank',()=>{
 const people=[
  mk(401),mk(500),mk(400,{teachingRoles:['instructeur']}),
  mk(501,{teachingRoles:['instructeur']})
 ];
 assert.deepEqual(orderedSpecialtyMembers(people).map(p=>p.call),[
  '500','501','400','401']);
 const instructorCalls=people.filter(p=>p.teachingRoles.includes('instructeur')).map(p=>p.call);
 assert.deepEqual(instructorCalls,['400','501']);
 assert.equal(people.length,4);
});
test('specialization cards are side by side and compact, responsive on mobile',()=>{
 assert.match(html,/police-specialty-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax/);
 assert.match(html,/\.police-intervention-group \.police-specialty-grid \.persons\{display:flex;flex-direction:column/);
 assert.match(html,/@media\(max-width:700px\)\{\.police-specialty-grid\{grid-template-columns:1fr\}\}/);
 assert.match(html,/minmax\(0,1130px\)/);
 assert.match(html,/className/);
 assert.match(html,/spec-list police-specialty-grid/);
 assert.match(html,/card\.open=true/);
});
function domNode(tag,cls='',text=''){
 return {tag,cls,text,children:[],attributes:{},events:{},
  append(...items){this.children.push(...items)},
  setAttribute(key,value){this.attributes[key]=value},
  addEventListener(key,fn){this.events[key]=fn}};
}
const flat=n=>[n,...(n.children||[]).flatMap(flat)];
test('visual instructor label sits beside name, on instructor card and member card',()=>{
 const start=script.indexOf('function person('),end=script.indexOf('function policeInterventions(',start);
 assert.ok(start>0&&end>start);
 const scope={el:domNode,window:{BPDPoliceUniform:{makePortrait:()=>null}},
  isTeacher:p=>p.teachingRoles?.includes('instructeur'),
  SERVICES:[{id:'politie',name:'Politie'}],$:()=>({textContent:''}),
  orderedMembers:rows=>rows,orderedSpecialtyMembers,};
 runInNewContext(script.slice(start,end)+';this.makePerson=person;',scope);
 const p=mk(501,{name:'Naam bij instructeur',teachingRoles:['instructeur']});
 const card=scope.makePerson(p,true);
 const labels=flat(card);
 assert.equal(labels.filter(el=>el.cls==='flag instructor'&&el.text==='INSTRUCTEUR').length,1);
 const heading=labels.find(el=>el.cls==='person-heading');
 assert.ok(heading.children.some(el=>el.tag==='b'&&el.text==='Naam bij instructeur'));
 assert.ok(heading.children.some(el=>el.cls==='flag instructor'));
 const docent=scope.makePerson(mk(500,{teachingRoles:['docent']}),true);
 assert.ok(flat(docent).some(el=>el.cls==='flag teacher'&&el.text==='DOCENT'));
});
test('specialty group renders instructor section above all members with duplicate card',()=>{
 const a=mk(500,{teachingRoles:['instructeur']});
 const b=mk(501),c=mk(400);
 const source=script.slice(script.indexOf('function specialtyBranch('),script.indexOf('function filteredRows('));
 const sandbox={el:domNode,isTeacher:p=>p.teachingRoles?.includes('instructeur'),
  peopleList:(rows,rankOnly,compact)=>{
   const node=domNode('list','persons',rankOnly?'members':'teachers');
   node.children=(rankOnly?orderedSpecialtyMembers(rows):rows).map(p=>domNode('person','',p.call));
   node.compact=compact;return node;
  }};
 runInNewContext(source+';this.build=specialtyBranch',sandbox);
 const card=sandbox.build({label:'INTERVENTIEDIENST',members:[a,b,c],note:'RADIO/BM inbegrepen'},true);
 const nodes=flat(card);
 const titles=nodes.filter(n=>n.cls.includes('group-title')).map(n=>n.text);
 assert.deepEqual(titles,['INSTRUCTEURS & DOCENTEN','LEDEN · RANGVOLGORDE']);
 assert.deepEqual(nodes.find(n=>n.tag==='list'&&n.text==='teachers').children.map(n=>n.text),['500']);
 assert.deepEqual(nodes.find(n=>n.tag==='list'&&n.text==='members').children.map(n=>n.text),[
  '500','501','400']);
 assert.equal(nodes.filter(n=>n.tag==='person'&&n.text==='500').length,2);
 assert.ok(nodes.some(n=>n.text==='RADIO/BM inbegrepen'));
});
test('other services, manual settings, undo, and main classic organogram are not changed',()=>{
 assert.match(html,/if\(solo&&settings\.id!=='politie'\)/);
 assert.match(html,/block\.append\(policeInterventions\(item\.branches\)\)/);
 assert.match(html,/manage-instructor/);
 assert.match(html,/manage-undo/);
 assert.match(html,/undoLastMiddleDrag/);
 assert.match(html,/Klassiek organogram/);
 assert.doesNotThrow(()=>new Script(script.replace(/^import[^\n]+\n/m,'')));
});
