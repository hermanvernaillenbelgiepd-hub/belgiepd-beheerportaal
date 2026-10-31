import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SERVICES,getTier,serviceHierarchy} from '../public/assets/organogram-hierarchie-model.js';
import {LEADERSHIP_LEVELS,validatePlacement} from '../src/organogram-placement-policy.js';

const levels=['Zoneleiding','Officieren','Middenkader','Basiskader','Stagiairs'];
const examples=[
 ['ZONECHEF','Zonecommandant','Zoneleiding'],
 ['OFF-02','Kolonel','Officieren'],
 ['OFF-06','Luitenant','Officieren'],
 ['OOFF-08','Adjudant','Middenkader'],
 ['OOFF-15','Sergeant','Middenkader'],
 ['BWM-01','Korporaal','Basiskader'],
 ['BWM-05','Korporaal','Basiskader'],
 ['BWM-06','Brandweerman/vrouw','Basiskader'],
 ['BWM-25','Brandweerman/vrouw','Basiskader'],
 ['STAG-01','Stagiair','Stagiairs'],
 ['STAG-21','Stagiair','Stagiairs']
];
const person=(call,rank,name='Lid')=>({
 dept:'brandweer',call,rank,name,leadershipTier:'none',
 specialties:[],teachingRoles:[]
});
test('five ordered fire cadres are consistent between organogram and display placement',()=>{
 assert.deepEqual(SERVICES.find(s=>s.id==='brandweer').levels,levels);
 assert.deepEqual(LEADERSHIP_LEVELS.brandweer,levels);
});
test('firefighter and trainee calls appear below the three existing senior cadres',()=>{
 for(const [call,rank,cadre] of examples){
  assert.equal(getTier(person(call,rank)),cadre,call);
 }
 const tree=serviceHierarchy(examples.map(([call,rank],i)=>person(call,rank,'Lid '+i)),'brandweer');
 assert.deepEqual(tree.leadership.map(x=>x.label),levels);
 assert.deepEqual(tree.leadership.map(x=>x.members.length),[1,2,2,4,2]);
 assert.equal(tree.count,11);
 assert.deepEqual(tree.leadership[3].members.map(x=>x.call),
  ['BWM-01','BWM-05','BWM-06','BWM-25']);
 assert.deepEqual(tree.leadership[4].members.map(x=>x.call),
  ['STAG-01','STAG-21']);
});
test('short OFF/O-OFF prefixes do not accidentally overlap with BWM or STAG',()=>{
 for(const [call,cadre] of [
  ['OFF-04','Officieren'],['OOFF-09','Middenkader'],
  ['BWM08','Basiskader'],['STAG03','Stagiairs']
 ]){
  assert.equal(getTier(person(call,'Niet opgegeven')),cadre);
 }
});
test('rank fallback works when a member has no recognized call',()=>{
 for(const [rank,cadre] of [
  ['Korporaal','Basiskader'],['Brandweervrouw','Basiskader'],
  ['Brandweerman/vrouw','Basiskader'],['Stagiair','Stagiairs'],
  ['Sergeant','Middenkader'],['Kapitein','Officieren'],
  ['Zonecommandant','Zoneleiding']
 ]){
  assert.equal(getTier(person('',rank)),cadre,rank);
 }
});
test('historic unknown fire entries are still shown without inventing a cadre',()=>{
 const unknown=person('FB-99','Nog te bepalen');
 const tree=serviceHierarchy([...examples.map(([call,rank])=>person(call,rank,call)),unknown],'brandweer');
 assert.equal(getTier(unknown),'Overige brandweerleden');
 assert.equal(tree.leadership.at(-1).label,'Overige brandweerleden');
 assert.deepEqual(tree.leadership.at(-1).members.map(x=>x.call),['FB-99']);
 assert.equal(tree.count,12);
});
test('cadre membership does not remove an unassigned firefighter from specialties',()=>{
 const withSpecialty={...person('BWM-01','Korporaal'),specialties:['Duiker']};
 const noSpecialty=person('BWM-06','Brandweerman/vrouw');
 const stag=person('STAG-01','Stagiair');
 const tree=serviceHierarchy([withSpecialty,noSpecialty,stag],'brandweer');
 const dive=tree.branches.find(b=>b.label==='Duiker');
 const remaining=tree.branches.find(b=>b.label==='Overige leden (geen geregistreerde specialisatie)');
 assert.ok(dive);
 assert.deepEqual(dive.members.map(p=>p.call),['BWM-01']);
 assert.deepEqual(remaining?.members.map(p=>p.call).sort(),['BWM-06','STAG-01']);
});
test('manual fire cadre options are display only and do not grant operational rights',()=>{
 const request={boardRole:'none',leadershipTier:'Stagiairs',displayOrder:0,
  teachingRoles:[],displayLabels:[],specialties:[],
  instructorSpecialties:[],teacherSpecialties:[],
  reason:'Indeling voor brandweerorganogram' };
 assert.equal(validatePlacement(request,'brandweer').leadershipTier,'Stagiairs');
 assert.equal(validatePlacement({...request,leadershipTier:'Basiskader'},'brandweer').leadershipTier,'Basiskader');
 assert.throws(()=>validatePlacement({...request,leadershipTier:'Operationele leden'},'brandweer'));
});
test('main page automatically renders all five fire cadre groups',()=>{
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(html,/for\(const level of item\.leadership\)/);
 assert.match(html,/const key=settings\.id\+':'\+level\.label/);
});
