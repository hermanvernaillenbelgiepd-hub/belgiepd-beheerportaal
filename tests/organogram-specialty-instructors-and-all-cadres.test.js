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
test('personnel profile uses wide two-column desktop layout with accessible mobile fallback',()=>{
 assert.match(html,/\.person-profile-dialog\{\s*width:min\(1260px,calc\(100vw - 32px\)\)/);
 assert.match(html,/max-height:calc\(100dvh - 24px\)/);
 assert.match(html,/\.person-profile-layout\{\s*display:grid;\s*grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.05fr\)/);
 assert.match(html,/\.person-profile-specialties\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:850px\)/);
 assert.match(html,/@media\(max-width:520px\)/);
 assert.match(script,/layout\.append\(intro,primary,secondary\)/);
 assert.match(script,/intro\.append\(overview\)/);
 assert.match(script,/primary\.append\(grid\)/);
 assert.match(script,/secondary\.append\(list\)/);
 assert.match(script,/dialog\.showModal\(\)/);
 assert.match(script,/event\.currentTarget\.close\(\)/);
});
test('public profile aligns specialty cards with public facts and selects each K9 patch stripe',()=>{
 assert.ok(html.includes('"intro ."'));
 assert.ok(html.includes('"details specials"'));
 assert.ok(html.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 assert.ok(html.includes('grid-area:details;min-width:0;padding-top:26px'));
 assert.ok(html.includes('grid-area:specials;min-width:0'));
 assert.ok(html.includes('height:18px;'));
 assert.ok(html.includes('min-height:68px;'));
 assert.ok(html.includes('grid-column:1 / -1;'));
 assert.ok(html.includes("background-image:url('/assets/k9-patches-geborduurd-20261029.webp')"));
 assert.ok(html.includes('background-size:90.625% 300%'));
 assert.ok(html.includes('background-origin:border-box;'));
 // Both patch types render inside an identical 170 x 53.125 outer frame.
 assert.ok(html.includes('width:170px;max-width:100%;'));
 assert.ok(html.includes('height:53.125px;aspect-ratio:16/5;'));
 assert.ok(html.includes('grid-template-columns:minmax(0,1fr) minmax(0,170px);'));
 // The 290:100 source preserves its native pixel proportions:
 // scaled width=170*(2.9/3.2)=154.0625, height=53.125.
 assert.equal(170*0.90625/53.125,2.9);
 assert.ok(html.includes('width:min(170px,40vw);height:auto;aspect-ratio:16/5'));
 assert.ok(html.includes('k9-patch-instructeur{background-position:50% 0%}'));
 assert.ok(html.includes('k9-patch-geleider{background-position:50% 50%}'));
 assert.ok(html.includes('k9-patch-geleider_in_stage{background-position:50% 100%}'));
 assert.ok(script.includes("const patch=el('span','k9-role-patch k9-patch-'+role)"));
 assert.ok(script.includes("patch.setAttribute('aria-label','K9-patch: '+roleLabels[role])"));
 // Only explicitly verified or manually assigned K9 roles may show a patch:
 // the obsolete generic patch is intentionally no longer rendered.
 assert.ok(script.includes("const role=p.k9Role;"));
 assert.ok(script.includes("if(Object.hasOwn(roleLabels,role))"));
 assert.ok(script.includes("K9-functie niet bevestigd"));
 assert.ok(!script.includes("k9-specialisatie-patch-20261029.webp"));
 assert.ok(html.includes('grid-template-areas:"intro" "details" "specials"'));
 assert.ok(script.includes('layout.append(intro,primary,secondary)'));
});

test('police specializations match the compact rank frame, including K9, without changing other services',()=>{
 const gradeFrame=html.match(/\.person-profile-grade\{\s*display:inline-flex;[\s\S]*?\n\}/)?.[0];
 assert.ok(gradeFrame);
 assert.match(gradeFrame,/width:fit-content/);
 assert.match(html,/--police-specialty-card-width:320px/);
 assert.match(html,/--police-specialty-card-height:74px/);
 assert.match(html,/\.person-profile-dialog\.police-person-profile \.person-profile-specialty\{\s*width:min\(100%,var\(--police-specialty-card-width\)\)/);
 assert.match(html,/min-height:var\(--police-specialty-card-height\)/);
 assert.match(html,/\.person-profile-dialog\.police-person-profile \.person-profile-specialty\.person-profile-specialty-k9\{\s*grid-column:auto/);
 assert.match(html,/grid-template-columns:minmax\(0,1fr\) 170px/);
 assert.match(html,/\.person-profile-dialog\.police-person-profile \.person-profile-specialty-k9 \.k9-role-patch\{\s*grid-column:2;grid-row:1 \/ span 2;\s*width:170px;height:53\.125px/);
 assert.match(html,/@media\(max-width:700px\)/);
 assert.match(html,/@media\(max-width:380px\)/);
 assert.match(script,/dialog\.classList\.toggle\('police-person-profile',p\.dept==='politie'\)/);
 // Non-police services continue using their original responsive card rules.
 assert.match(html,/\.person-profile-specialty\{border:1px solid #42668a/);
 assert.match(script,/const role=p\.k9Role;/);
});
test('grid and original uniform/drag controls remain available',()=>{
 assert.match(html,/spec-list police-specialty-grid/);
 assert.match(html,/middleCadreLayout\(level\.members\)/);
 assert.match(html,/canDragMiddle\(p,series\)/);
 assert.match(html,/unified-gold-navy-frame-20261028/);
 assert.match(html,/Klassiek organogram/);
 assert.match(html,/undoLastMiddleDrag/);
});
