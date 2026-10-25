import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canChangePoliceGrade,allowedPoliceGradeChoices,
  validatePoliceGradeChange,classifyPoliceGradeChange,policeCallGrade} from '../src/personnel-rank-policy.js';
import {mergePersonnelEdits} from '../src/personnel-editor-policy.js';
import {staffActivityEvent} from '../src/personnel-activity.js';
import {SPECIALTY_LABELS} from '../src/normalize.js';
import {roleSummary} from '../src/role-catalog.js';

const actorId='111111111111111111',subjectId='222222222222222222';
const officer={uid:'discord:'+actorId,discordId:actorId,role:'officierenkader',
  discordPoliceRank:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},dossierAllowedDepartments:['politie'],
  dossierNativeDepartments:['politie'],boardPersonnelAdmin:false,
  portalTechnicalMode:false};
const corps={...officer,role:'korpsleiding',discordPoliceRank:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}};
const target=(call='438',rank='Inspecteur')=>({
  dept:'politie',personId:subjectId,call,rank,name:'Testlid',status:'Actief'});

test('Officierenkader changes lower police grades, not own or officers',()=>{
 assert.equal(canChangePoliceGrade(officer,target()),true);
 assert.equal(canChangePoliceGrade(officer,target('730','Hoofdinspecteur')),true);
 assert.equal(canChangePoliceGrade(officer,target('920','Aspirant Commissaris')),false);
 assert.equal(canChangePoliceGrade(officer,{...target(),personId:actorId}),false);
 assert.equal(canChangePoliceGrade({...officer,discordPoliceRank:null},target()),false);
 assert.equal(canChangePoliceGrade({...officer,dossierNativeDepartments:[]},target()),false);
 assert.equal(canChangePoliceGrade({...officer,role:'middenkader',
   departmentRoles:{politie:'middenkader'}},target()),false);
 assert.equal(allowedPoliceGradeChoices(officer).includes('Aspirant Commissaris'),false);
});
test('Korpsleiding can change officer rank, never protected 900/910',()=>{
 assert.equal(canChangePoliceGrade(corps,target('930','Aspirant Commissaris')),true);
 assert.equal(canChangePoliceGrade(corps,target('900','Eerste Hoofdcommissaris')),false);
 assert.equal(canChangePoliceGrade(corps,target('910','Eerste Commissaris')),false);
 assert.equal(allowedPoliceGradeChoices(corps).includes('Aspirant Commissaris'),true);
});
test('Callsign must match exact destination rank and be outside protected corps numbering',()=>{
 const body={expectedRank:'Inspecteur',newRank:'Aspirant Inspecteur',
   newCall:'328',reason:'Onderbouwde beslissing wegens langdurige bijsturing.',
   expectedRevision:0};
 assert.equal(validatePoliceGradeChange(body).newCall,'328');
 assert.throws(()=>validatePoliceGradeChange({...body,newCall:'438'}),/roepnummer/);
 assert.throws(()=>validatePoliceGradeChange({...body,newRank:'Aspirant Commissaris',newCall:'900'}),/roepnummer/);
 assert.throws(()=>validatePoliceGradeChange({...body,newRank:'Inspecteur'}),/andere/);
 assert.throws(()=>validatePoliceGradeChange({...body,reason:'te kort'}),/Motivering/);
 assert.throws(()=>validatePoliceGradeChange({...body,expectedRevision:NaN}),/Vernieuw/);
 assert.equal(policeCallGrade('501'),3);
 assert.equal(policeCallGrade('930'),7);
 assert.equal(policeCallGrade('900'),null);
 assert.equal(classifyPoliceGradeChange('501','428'),'demotion');
 assert.equal(classifyPoliceGradeChange('428','730'),'promotion');
 assert.equal(classifyPoliceGradeChange('425','428'),'rank_changed');
});
test('Only approved rank overlays can change displayed grade; preserve origin otherwise',()=>{
 const src=[target()];
 const manual={dept:'politie',discordId:subjectId,revision:1,
   name:'Testlid',call:'328',status:'Actief',rank:'Aspirant Inspecteur'};
 assert.equal(mergePersonnelEdits(src,[manual])[0].rank,'Inspecteur');
 assert.equal(mergePersonnelEdits(src,[{...manual,approvedRankEdit:true}])[0].rank,
  'Aspirant Inspecteur');
 assert.equal(mergePersonnelEdits(src,[{...manual,status:'GESCHORST',approvedRankEdit:true}])[0].rank,
  'Aspirant Inspecteur');
});
test('Promotions and demotions appear in the recent staff activity history',()=>{
 const data={dept:'politie',discordId:subjectId,name:'Testlid',
   before:'Inspecteur',after:'Aspirant Inspecteur',
   at:new Date('2026-10-25T17:00:00Z')};
 assert.equal(staffActivityEvent('d1',{...data,type:'demotion'}).type,'demotion');
 assert.equal(staffActivityEvent('d2',{...data,type:'rank_changed'}).type,'rank_changed');
});
test('LRD role matches existing Discord role and is an editable police specialty',()=>{
 assert.ok(SPECIALTY_LABELS.politie.includes('LRD (Recherche)'));
 const roles=roleSummary(['1380843428354592780']);
 assert.ok(roles.roles.some(r=>r.name==='LRD (Lokale Recherche)'));
 assert.equal(roles.policeRank,null);
});
test('New rank workflow includes server checks and visible history integration',()=>{
 const routes=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(routes,/\/rank-change'/);
 assert.match(routes,/canChangePoliceGrade\(req\.bpd,subject\)/);
 assert.match(routes,/classifyPoliceGradeChange/);
 assert.match(routes,/PERSONNEL_ACTIVITY_COLLECTION/);
 assert.match(page,/id="rankChangeForm"/);
 assert.match(page,/id="rankChangePanel"/);
 assert.match(page,/demotion:'Degradatie'/);
});
