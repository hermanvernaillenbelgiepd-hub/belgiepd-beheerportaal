import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import {serviceHierarchy,orderedSpecialtyMembers,isSpecialtyInstructor}
 from '../public/assets/organogram-hierarchie-model.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const src=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const node=(tag,cls='',value='')=>({
 tag,cls,value,children:[],append(...children){this.children.push(...children)},
 setAttribute(k,v){this[k]=v},addEventListener(){},
});
const flat=root=>[root,...(root.children||[]).flatMap(flat)];
function renderSpecialty(branch,isPolice=true){
 const begin=src.indexOf('function specialtyBranch(');
 const end=src.indexOf('function filteredRows(',begin);
 assert.ok(begin>0&&end>begin);
 const context={
  el:node,state:{specialtyOpen:{}},
  isTeacher:p=>(p.teachingRoles||[]).includes('instructeur'),
  isSpecialtyInstructor,
  peopleList:(rows,rankOnly,compact,specialty)=>{
   const group=node('list','persons',rankOnly?'members':'instructors');
   group.compact=compact;group.specialty=specialty;
   group.children=(rankOnly?orderedSpecialtyMembers(rows):rows)
    .map(p=>node('person','',p.call));
   return group;
  }
 };
 runInNewContext(src.slice(begin,end)+';this.build=specialtyBranch;',context);
 return context.build(branch,isPolice);
}
const mk=(call,specialties,teaching=[])=>({
 dept:'politie',call:String(call),name:'Person '+call,rank:'Inspecteur',
 specialties,teachingRoles:teaching,
 instructorSpecialties:teaching.includes('instructeur')?['K9']:[],
 teacherSpecialties:[]});
test('police specialization has two inner role columns side by side',()=>{
 assert.match(html,/\.police-specialty-role-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/\.police-intervention-group \.police-specialty-grid\{[\s\S]*?display:flex;flex-wrap:nowrap/);
 assert.match(html,/@media\(max-width:800px\)\{\.police-specialty-role-grid\{grid-template-columns:1fr\}\}/);
});
test('assigned instructor appears only on the left, others only on the right',()=>{
 const rows=[
  mk(930,['K9'],['instructeur']),
  mk(500,['K9']),
  mk(401,['K9']),
  mk(400,['K9'])];
 const branch=serviceHierarchy(rows,'politie').branches.find(b=>b.label==='K9');
 const dom=renderSpecialty(branch);
 const groups=flat(dom).filter(x=>x.tag==='list');
 assert.equal(groups.length,2);
 assert.deepEqual(groups[0].children.map(x=>x.value),['930']);
 assert.deepEqual(groups[1].children.map(x=>x.value),['500','400','401']);
 assert.equal(flat(dom).filter(x=>x.tag==='person'&&x.value==='930').length,1);
 assert.equal(flat(dom).filter(x=>x.cls==='police-specialty-role-column').length,2);
});
test('teacher and instructor chosen for one specialty is a member elsewhere, not an instructor',()=>{
 const tutor=mk(610,['K9','RAGO'],['instructeur']);
 const membership=serviceHierarchy([tutor],'politie');
 const k9=renderSpecialty(membership.branches.find(b=>b.label==='K9'));
 const rago=renderSpecialty(membership.branches.find(b=>b.label==='RAGO'));
 const groupsK9=flat(k9).filter(x=>x.tag==='list');
 const groupsRago=flat(rago).filter(x=>x.tag==='list');
 assert.deepEqual(groupsK9[0].children.map(x=>x.value),['610']);
 assert.equal(groupsK9.length,1);
 assert.deepEqual(groupsRago[0].children.map(x=>x.value),['610']);
 assert.equal(groupsRago.length,1);
 assert.equal(groupsRago[0].value,'members');
});
test('specializations with no instructors or members have clear empty sections',()=>{
 const dom=renderSpecialty({label:'SEMI ANONIEM',members:[]});
 const labels=flat(dom).map(x=>x.value);
 assert.ok(labels.includes('Geen instructeurs geregistreerd'));
 assert.ok(labels.includes('Geen overige leden'));
});
test('other services remain on their existing layout and existing recovery remains',()=>{
 const p={dept:'brandweer',call:'OOFF-08',name:'Brandweerlid',teachingRoles:['instructeur'],specialties:['Duiker']};
 const card=renderSpecialty({label:'Duiker',members:[p]},false);
 const all=flat(card);
 assert.equal(all.filter(x=>x.cls==='police-specialty-role-grid').length,0);
 assert.ok(all.some(x=>x.value==='Docenten / instructeurs'));
 assert.match(html,/Klassiek organogram/);
 assert.match(html,/undoLastMiddleDrag/);
 assert.match(html,/manage-undo/);
 assert.doesNotThrow(()=>new Script(src.replace(/^import[^\n]+\n/m,'')));
});
