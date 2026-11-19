import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMPLETION_OVERVIEW_DEPARTMENTS,COMPLETION_OVERVIEW_BATCH,
 COMPLETION_OVERVIEW_RECORD_LIMIT,COMPLETION_OVERVIEW_CASE_LIMIT,
 completedTrainingResult,completedTrainingAttendance,completionSort}
 from '../src/training-completion-overview.js';
const path=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const id='1398985105254650007';
const subject={dept:'politie',personId:id,name:'Medewerker',call:'316',rank:'Inspecteur'};

test('Every registered training outcome is visible for authorized leadership',()=>{
 const src={department:'politie',subjectDiscordId:id,courseName:'K-9',
   result:'geslaagd',eventDate:'2026-11-10',instructorName:'Opleider',
   details:'Met succes afgerond',rosterStatus:'klaar_voor_manuele_invoer',
   registeredByDiscordId:'1309532438019706966',status:'geregistreerd'};
 const result=completedTrainingResult(src,subject,'abc123');
 assert.deepEqual([result.result,result.source,result.eventDate,result.name,result.instructor],
  ['geslaagd','opleidingsregister','2026-11-10','Medewerker','Opleider']);
 for(const result of ['aanwezig','geslaagd','niet_geslaagd','onderbroken',
   'in_opleiding','stage','restricted'])
   assert.equal(completedTrainingResult({...src,result},subject,'abc123')?.result,result);
 assert.equal(completedTrainingResult({...src,result:'ONBEKEND'},subject,'abc123'),null);
 assert.equal(completedTrainingResult({...src,status:'verwijderd'},subject,'abc123'),null);
 assert.equal(completedTrainingResult({...src,subjectDiscordId:'111111111111111111'},subject,'abc123'),null);
 assert.equal(completedTrainingResult({...src,eventDate:'2026-02-31'},subject,'abc123'),null);
});
test('Confirmed attendance is not silently upgraded to a pass',()=>{
 const entry={type:'opleiding',reportCategory:'opleiding',dept:'politie',
  subjectDiscordId:id,eventDate:'2026-11-10',courseName:'RADIO BM',
  trainingRequestId:'aBcD1234',registeredBy:{name:'Bevoegde opleider'},
  details:'Opleiding uitgevoerd'};
 const result=completedTrainingAttendance(entry,subject,'case1');
 assert.equal(result.result,'deelname_bevestigd');
 assert.equal(result.instructor,'Bevoegde opleider');
 assert.match(result.details,/Geen slagingsresultaat/);
 assert.equal(completedTrainingAttendance({...entry,type:'activiteit'},subject,'case1'),null);
 assert.equal(completedTrainingAttendance({...entry,trainingRequestId:null},subject,'case1'),null);
 assert.equal(completedTrainingAttendance({...entry,testRecord:true},subject,'case1'),null);
 assert.equal(completedTrainingAttendance({...entry,status:'verwijderd'},subject,'case1'),null);
});
test('Departments and pagination are explicitly bounded',()=>{
 assert.deepEqual([...COMPLETION_OVERVIEW_DEPARTMENTS],
  ['politie','brandweer','ambulance','depannage']);
 assert.equal(COMPLETION_OVERVIEW_BATCH,20);
 assert.equal(COMPLETION_OVERVIEW_RECORD_LIMIT,100);
 assert.equal(COMPLETION_OVERVIEW_CASE_LIMIT,150);
 assert.equal(completionSort({eventDate:'2026-11-01',name:'A'},
  {eventDate:'2026-11-10',name:'B'})>0,true);
});
test('Overview endpoint reuses verified trainer rights and protects subjects',()=>{
 const r=path('src/role-routes.js');
 assert.match(r,/app\.get\('\/api\/training\/completed-overview\/context',resolveActor/);
 assert.match(r,/app\.get\('\/api\/training\/completed-overview',resolveActor/);
 assert.match(r,/trainingAccess\(req,dept,'review'\)/);
 assert.match(r,/verifiedSubjects\(subjects\)/);
 assert.match(r,/mayAccessSubject\(req\.roleActor\.bpd,p,verified\)/);
 assert.match(r,/getSnapshot\(\{includeArchived:true\}\)/);
 assert.match(r,/orderBy\('createdAt','desc'\)/);
 assert.match(r,/private, no-store/);
 assert.doesNotMatch(r.slice(r.indexOf("app.get('/api/training/completed-overview',"),
  r.indexOf("app.get('/api/training/people',")),/\.create\(|\.update\(|\.delete\(/);
});
test('Overview and dossier links are present; weekreport distinguishes result types',()=>{
 const page=path('public/voltooide-opleidingen.html');
 const staff=path('public/personeelsbeheer.html');
 const school=path('public/opleidingscentrum.html');
 const report=path('src/management-routes.js');
 const view=path('public/weekrapporten.html');
 assert.match(page,/Open personeelsdossier/);
 assert.match(page,/\/api\/training\/completed-overview/);
 assert.match(page,/fiche:'1',dept:x\.dept,discordId:x\.discordId/);
 assert.match(staff,/Voltooide opleidingen/);
 assert.match(staff,/sheetTraining/);
 assert.match(school,/\/voltooide-opleidingen\.html/);
 assert.match(report,/const completionSummary=/);
 assert.match(report,/trainingResult==='geslaagd'/);
 assert.match(report,/item\.trainingRequestId&&item\.reportCategory==='opleiding'/);
 assert.match(view,/Geslaagde opleidingen/);
 assert.match(view,/Deelname bevestigd/);
 assert.match(path('src/report-export.js'),/Geslaagde opleidingen/);
});
