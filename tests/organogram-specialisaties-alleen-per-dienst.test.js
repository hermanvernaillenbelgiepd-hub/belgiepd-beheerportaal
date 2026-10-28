import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/organogram-hierarchie-proef.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function serviceCard('),html.indexOf('function filteredRows('));
function element(tag,className='',text=''){
 return {
  tag,className,text,children:[],dataset:{},events:{},open:false,
  append(...items){this.children.push(...items)},
  setAttribute(k,v){this[k]=v},
  addEventListener(name,fn){this.events[name]=fn}
 };
}
const nodeList=node=>[node,...node.children.flatMap(nodeList)];
const people={
 dept:'politie',name:'Motard 500',rank:'Eerste inspecteur',call:'500',
 teachingRoles:['instructeur'],specialties:['Motard']
};
const item={
 count:1,leadership:[{label:'Korpsleiding',members:[people]}],
 branches:[{label:'Motard',members:[people]}]
};
const settings={id:'politie',name:'Politie',icon:'👮'};
function run(solo){
 const state={view:'alle',demo:false},called=[];
 const ctx={
  state,
  el:element,
  isTeacher:p=>p.teachingRoles?.includes('instructeur'),
  peopleList:rows=>{const list=element('div','persons');for(const row of rows)list.append(element('span','person',row.name));return list},
  render:()=>called.push(state.view),
 };
 runInNewContext(code+';this.renderService=serviceCard',ctx);
 return {node:ctx.renderService(item,settings,solo),called,state};
}
test('global view shows leadership but no specialty sections or instructor/member lists',()=>{
 const {node}=run(false);
 const flattened=nodeList(node);
 assert.ok(flattened.some(n=>n.className==='level-title'&&n.text==='Korpsleiding'));
 assert.ok(flattened.some(n=>n.className==='person'&&n.text==='Motard 500'));
 assert.ok(!flattened.some(n=>n.className==='spec-heading'));
 assert.ok(!flattened.some(n=>n.className==='specialty'));
 assert.ok(!flattened.some(n=>n.className==='group-title'));
});
test('clicking a service in global view opens its dedicated page',()=>{
 const {node,called,state}=run(false);
 const summary=node.children[0];
 assert.equal(typeof summary.events.click,'function');
 let prevented=false;
 summary.events.click({preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.equal(state.view,'politie');
 assert.deepEqual(called,['politie']);
});
test('inside selected service all specializations and instructor groups remain available',()=>{
 const {node}=run(true),flattened=nodeList(node);
 assert.ok(flattened.some(n=>n.className==='spec-heading'&&n.text==='SPECIALISATIES / PLOEGEN'));
 assert.ok(flattened.some(n=>n.className==='specialty'));
 assert.ok(flattened.some(n=>n.className==='group-title'&&n.text==='Docenten / instructeurs'));
 assert.ok(!flattened.some(n=>n.className==='group-title'&&n.text==='Leden in rangvolgorde'));
});
test('view selection remains independent of manual-role persistence',()=>{
 assert.match(html,/if\(solo\)\{\s*body\.append\(el\('div','spec-heading'/);
 assert.match(html,/summary\.addEventListener\('click',event=>\{/);
 assert.match(html,/\/api\/organogram\/placements\/admin/);
 assert.match(html,/state\.view=btn\.dataset\.view/);
});
