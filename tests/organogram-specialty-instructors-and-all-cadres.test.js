import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {serviceHierarchy,specialtyInstructorRoles,isSpecialtyInstructor,orderedSpecialtyMembers}
 from '../public/assets/organogram-hierarchie-model.js';
import {verifiedSyncRoles,mergePlacement,manualDisplay,validatePlacement}
 from '../src/organogram-placement-policy.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const model=readFileSync(new URL('../public/assets/organogram-hierarchie-model.js',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const base=(name,call,extras={})=>({dept:'politie',name,call:String(call),rank:'Inspecteur',specialties:[],...extras});

test('police structure restores basiskader and agentenkader, below middenkader',()=>{
 const p=serviceHierarchy([
  base('Midden',710),base('Basis 401',401),base('Basis 500',500),
  base('Basis 310',310),base('Agent 220',220),base('Agent 100',100)
 ],'politie');
 assert.deepEqual(p.leadership.map(g=>g.label),[
  'Korpsleiding','Officierenkader','Middenkader','Basiskader','Agentenkader'
 ]);
 assert.deepEqual(p.leadership[3].members.map(x=>x.call),['500','401','310']);
 assert.deepEqual(p.leadership[4].members.map(x=>x.call),['220','100']);
 assert.match(html,/levelBody\.append\(policeInterventions\(item\.branches\)\)/);
 assert.match(html,/for\(const level of item\.leadership\)/);
});
test('generic instructor role does NOT confer instructor status in every specialty',()=>{
 const hubert=base('Algemene instructeur',930,{
  teachingRoles:['instructeur'],instructorSpecialties:['K9'],
  specialties:['MOTARD','K9','SIGNALISATIE']});
 assert.deepEqual(specialtyInstructorRoles(hubert,'K9'),['instructeur']);
 assert.deepEqual(specialtyInstructorRoles(hubert,'MOTARD'),[]);
 assert.deepEqual(specialtyInstructorRoles(hubert,'SIGNALISATIE'),[]);
 assert.equal(isSpecialtyInstructor(hubert,'K9'),true);
 assert.equal(isSpecialtyInstructor(hubert,'MOTARD'),false);
 const p=serviceHierarchy([hubert],'politie');
 assert.equal(p.branches.find(x=>x.label==='K9').members[0],hubert);
 assert.equal(p.branches.find(x=>x.label==='MOTARD').members[0],hubert);
});
test('specific Discord instructor role only enables that discipline',()=>{
 const now=Date.now(),guild='111111111111111111';
 const synced=verifiedSyncRoles({
  guildId:guild,verifiedAt:now,roleIds:[
   '1359656762289946755', // motard instructor
   '1309532437977497699'  // K9 membership only
  ]},'politie',guild,now);
 const p=mergePlacement(base('Member and instructor',501),null,synced);
 assert.deepEqual(p.instructorSpecialties,['MOTARD']);
 assert.deepEqual(specialtyInstructorRoles(p,'MOTARD'),['instructeur']);
 assert.deepEqual(specialtyInstructorRoles(p,'K9'),[]);
 assert.ok(p.specialties.includes('K9'));
});
test('manual specialties are validated, independently checked and reversible',()=>{
 const manual={boardRole:'none',leadershipTier:'none',displayOrder:0,
  teachingRoles:['instructeur'],specialties:['K9','MOTARD'],
  instructorSpecialties:['K9'],teacherSpecialties:['MOTARD'],
  reason:'Controle tijdelijke vakinstructeur'};
 const saved=validatePlacement(manual,'politie');
 assert.deepEqual(saved.instructorSpecialties,['K9']);
 assert.deepEqual(saved.teacherSpecialties,['MOTARD']);
 assert.throws(()=>validatePlacement({...manual,instructorSpecialties:['DISP']},'politie'));
 assert.throws(()=>validatePlacement({...manual,teacherSpecialties:['K9','K9']},'politie'));
 assert.throws(()=>validatePlacement({...manual,instructorSpecialties:['K9'],specialties:['MOTARD']},'politie'));
 const persisted=manualDisplay({...saved,dept:'politie',status:'active'},'politie');
 const merged=mergePlacement(base('Twee rollen',500),persisted,{
  boardRole:'none',teachingRoles:[],specialties:[],
  instructorSpecialties:[],teacherSpecialties:[],synced:false});
 assert.deepEqual(specialtyInstructorRoles(merged,'K9'),['instructeur']);
 assert.deepEqual(specialtyInstructorRoles(merged,'MOTARD'),['docent']);
 assert.deepEqual(specialtyInstructorRoles(merged,'SIGNALISATIE'),[]);
});
test('STAGE and LID are exclusive manual presentation labels, not teaching functions',()=>{
 const basePlacement={boardRole:'none',leadershipTier:'none',displayOrder:0,
  teachingRoles:['docent'],specialties:['K9'],instructorSpecialties:[],
  teacherSpecialties:['K9'],reason:'Handmatige organogramweergave'};
 const stage=validatePlacement({...basePlacement,displayLabels:['stage']},'politie');
 assert.deepEqual(stage.displayLabels,['stage']);
 const stored=manualDisplay({...stage,dept:'politie',status:'active'},'politie');
 assert.deepEqual(stored.displayLabels,['stage']);
 const merged=mergePlacement(base('Stage',570),stored,{boardRole:'none',
  specialties:['K9'],teachingRoles:[],instructorSpecialties:[],
  teacherSpecialties:[],synced:true});
 assert.deepEqual(merged.displayLabels,['stage']);
 assert.deepEqual(merged.teachingRoles,['docent']);
 assert.deepEqual(specialtyInstructorRoles(merged,'K9'),['docent']);
 assert.deepEqual(validatePlacement({...basePlacement,displayLabels:['lid']},'politie').displayLabels,['lid']);
 assert.deepEqual(validatePlacement(basePlacement,'politie').displayLabels,[]);
 assert.throws(()=>validatePlacement({...basePlacement,displayLabels:['stage','lid']},'politie'));
 assert.throws(()=>validatePlacement({...basePlacement,displayLabels:['admin']},'politie'));
 assert.throws(()=>validatePlacement({...basePlacement,displayLabels:'stage'},'politie'));
 assert.throws(()=>validatePlacement({...basePlacement,displayLabels:['lid']},'bestuur'));
});
test('management links to the roster and stores display labels without authorizing personnel edits',()=>{
 assert.match(html,/href="\/personeelslijst\.html" target="_blank"/);
 assert.match(html,/id="manage-stage"/);
 assert.match(html,/id="manage-member"/);
 assert.match(html,/flag stage/);
 assert.match(html,/flag member/);
 assert.match(script,/displayLabels:\s*Array\.isArray\(p\.displayLabels\)/);
 assert.match(script,/body:JSON\.stringify\(\{boardRole,leadershipTier,displayOrder,teachingRoles,displayLabels,specialties/);
 assert.match(route,/displayLabels:values\.displayLabels/);
 assert.match(route,/displayLabels:restored\.displayLabels/);
 assert.match(route,/canManagePlacements\(req\.bpd\)/);
});
test('legacy general instructor check does not invent specialisation assignment',()=>{
 const old=manualDisplay({
  dept:'politie',status:'active',boardRole:'none',
  teachingRoles:['instructeur'],specialties:['Motor','K-9']
 },'politie');
 assert.deepEqual(old.specialties,['MOTARD','K9']);
 assert.deepEqual(old.instructorSpecialties,[]);
 const merged=mergePlacement(base('Oude algemene instructeur',500),old,{
  boardRole:'none',teachingRoles:[],specialties:[],synced:false});
 assert.deepEqual(specialtyInstructorRoles(merged,'MOTARD'),[]);
 assert.deepEqual(specialtyInstructorRoles(merged,'K9'),[]);
});
test('rendered specialization labels depend on exact instructor assignments',()=>{
 assert.match(script,/isPolice\?isSpecialtyInstructor\(p,branch\.label\):isTeacher\(p\)/);
 assert.match(script,/specialtyInstructorRoles\(p,specialtyLabel\)/);
 assert.match(html,/flag instructor/);
 assert.match(html,/input\.dataset\.role='member'/);
 assert.match(html,/flag\.dataset\.role=role/);
 assert.match(html,/instructorSpecialties,teacherSpecialties,reason/);
 assert.match(route,/instructorSpecialties:values\.instructorSpecialties/);
 assert.match(route,/teacherSpecialties:restored\.teacherSpecialties/);
 assert.match(route,/action:'manual_display_undo'/);
 assert.doesNotThrow(()=>new Script(script.replace(/^import[^\n]+\n/m,'')));
});
test('grid and original uniform/drag controls remain available',()=>{
 assert.match(html,/spec-list police-specialty-grid/);
 assert.match(html,/middleCadreLayout\(level\.members\)/);
 assert.match(html,/canDragMiddle\(p,series\)/);
 assert.match(html,/unified-gold-navy-frame-20261028/);
 assert.match(html,/Klassiek organogram/);
 assert.match(html,/undoLastMiddleDrag/);
});
