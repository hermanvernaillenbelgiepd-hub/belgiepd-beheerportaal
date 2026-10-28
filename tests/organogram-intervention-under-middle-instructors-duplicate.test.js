import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {orderedSpecialtyMembers,orderedMembers,serviceHierarchy}
 from '../public/assets/organogram-hierarchie-model.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const instructor={dept:'politie',call:'400',name:'Dezelfde instructeur',
 teachingRoles:['instructeur'],instructorSpecialties:['MOTARD'],specialties:['Motor','Dispatch']};
const student={dept:'politie',call:'700',name:'Hoofdinspecteur motard',
 teachingRoles:[],specialties:['Motor']};
function node(tag,cls='',label=''){
 return {tag,cls,label,children:[],
  append(...xs){this.children.push(...xs)},
  setAttribute(key,value){this[key]=value}};
}
function mockBranch(branch){
 const start=source.indexOf('function specialtyBranch(');
 const end=source.indexOf('function filteredRows(',start);
 const sandbox={el:node,isTeacher:p=>p.teachingRoles?.includes('instructeur'),
  isSpecialtyInstructor:(p,label)=>(p.instructorSpecialties||[]).includes(label),
  peopleList:(rows,rankOnly)=>{
   const group=node('list','persons',rankOnly?'members':'staff');
   group.children.push(...(rankOnly?orderedSpecialtyMembers(rows):orderedMembers(rows))
    .map(p=>node('person','',p.name)));
   return group;
  }};
 runInNewContext(source.slice(start,end)+';this.build=specialtyBranch;',sandbox);
 return sandbox.build(branch,true);
}
const flatten=n=>[n,...(n.children||[]).flatMap(flatten)];
test('specializations are a child of police middle-cadre in service-only view',()=>{
 assert.match(html,/solo&&settings\.id==='politie'&&level\.label==='Middenkader'/);
 assert.match(html,/block\.append\(middleCadreLayout\(level\.members\)\)/);
 assert.match(html,/block\.append\(policeInterventions\(item\.branches\)\)/);
 assert.match(html,/if\(solo&&settings\.id!=='politie'\)/);
 assert.match(html,/police-intervention-group/);
 assert.match(html,/SPECIALISATIES · POLITIE/);
});
test('instructors appear in their own section and not in the ordinary members of the same specialization',()=>{
 const branch=serviceHierarchy([instructor,student],'politie').branches.find(x=>x.label==='MOTARD');
 assert.ok(branch);
 const card=mockBranch(branch);
 const nodes=flatten(card);
 const people=nodes.filter(n=>n.tag==='person');
 assert.equal(people.filter(p=>p.label==='Dezelfde instructeur').length,1);
 assert.equal(people.filter(p=>p.label==='Hoofdinspecteur motard').length,1);
 assert.equal(nodes.filter(n=>n.label==='INSTRUCTEURS & DOCENTEN').length,1);
 assert.equal(nodes.filter(n=>n.label==='LEDEN · RANGVOLGORDE').length,1);
 const order=nodes.find(n=>n.tag==='list'&&n.label==='members');
 assert.deepEqual(order.children.map(x=>x.label),['Hoofdinspecteur motard']);
});
test('an instructor may show in several specialties, while member identity is shared',()=>{
 const p=serviceHierarchy([instructor,student],'politie');
 const motard=p.branches.find(x=>x.label==='MOTARD');
 const dispatch=p.branches.find(x=>x.label==='DISP');
 assert.ok(motard);assert.ok(dispatch);
 assert.equal(motard.members[0],dispatch.members[0]);
 const selected=mockBranch(dispatch);
 assert.equal(flatten(selected).filter(n=>n.tag==='person'&&n.label===instructor.name).length,1);
});
test('teacher priority is retained in instructor section but not artificially elevated in member rank list',()=>{
 assert.deepEqual(orderedMembers([instructor,student]).map(p=>p.call),['400','700']);
 assert.deepEqual(orderedSpecialtyMembers([instructor,student]).map(p=>p.call),['700','400']);
});
test('other services and global view remain unchanged; nobody gains dossier rights',()=>{
 assert.match(html,/if\(solo&&settings\.id!=='politie'\)/);
 assert.match(html,/if\(!solo\)\{/);
 assert.match(html,/displayOnly/);
 const oldRoutes=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 assert.match(oldRoutes,/accessRightsChanged:false/);
 assert.doesNotMatch(source,/fetch\([^)]*\/api\/dossiers/);
});
