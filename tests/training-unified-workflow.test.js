import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRAINING_RESULTS,TRAINING_RESULT_LABELS,isTrainingResult,
 isCurrentTrainingResult} from '../src/training-result-policy.js';
import {canLogTraining,canReviewTraining,effectivePermissions} from '../src/permissions-utils.js';
import {approvedManagedEntry} from '../src/user-access.js';
import {completedTrainingResult} from '../src/training-completion-overview.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const actor=(dept,role)=>({trustedStaff:true,role,departments:[dept],
 departmentRoles:{[dept]:role}});
const id='1398985105254650007';
const subject={dept:'ambulance',personId:id,name:'Onderzoek',call:'AMB-21'};
test('Vier actuele opleidingsresultaten met onveranderde historische statussen',()=>{
 assert.deepEqual([...TRAINING_RESULTS],['aanwezig','geslaagd','niet_geslaagd','onderbroken']);
 for(const outcome of TRAINING_RESULTS){
  assert.equal(isTrainingResult(outcome),true);
  assert.equal(isCurrentTrainingResult(outcome),true);
  assert.ok(TRAINING_RESULT_LABELS[outcome]);
  const result=completedTrainingResult({department:'ambulance',
   subjectDiscordId:id,eventDate:'2026-11-19',result:outcome,
   courseName:'PIT',status:'geregistreerd'},subject,'123');
  assert.equal(result?.result,outcome);
 }
 for(const old of ['in_opleiding','stage','restricted']){
  assert.equal(isTrainingResult(old),true);
  assert.equal(isCurrentTrainingResult(old),false);
 }
 assert.equal(isTrainingResult('deelname_bevestigd'),false);
 assert.equal(isTrainingResult('willekeurig'),false);
});
test('Middenkader en hoger mogen uitsluitend binnen hun eigen dienst registreren',()=>{
 for(const dept of ['politie','brandweer','ambulance','depannage']){
  for(const rank of ['middenkader','officierenkader','korpsleiding']){
   assert.equal(canLogTraining(actor(dept,rank),dept,{}),true,dept+' '+rank);
   assert.equal(canReviewTraining(actor(dept,rank),dept,{}),true,dept+' '+rank);
  }
  assert.equal(canLogTraining(actor(dept,'basiskader'),dept,{}),false);
  assert.equal(canLogTraining(actor(dept,'officierenkader'),'burger',{}),false);
 }
});
test('Goedgekeurd middenkaderaccount geeft uitsluitend opleidingsrechten voor de eigen dienst',()=>{
 const id='123456789012345678';
 const grant=approvedManagedEntry({status:'approved',discordId:id,role:'middenkader',
  departments:['politie'],departmentRoles:{politie:'middenkader'}},id);
 assert.ok(grant);
 const scoped={...grant,trustedStaff:true};
 assert.equal(canLogTraining(scoped,'politie',{}),true);
 assert.equal(canReviewTraining(scoped,'politie',{}),true);
 assert.equal(canLogTraining(scoped,'ambulance',{}),false);
 assert.equal(canReviewTraining(scoped,'brandweer',{}),false);
 assert.equal(approvedManagedEntry({status:'pending',discordId:id,role:'middenkader',
  departments:['politie'],departmentRoles:{politie:'middenkader'}},id),null);
 const route=file('src/role-routes.js');
 assert.match(route,/verifiedDiscordIdentity\\(decoded,member,process\\.env\\.DISCORD_GUILD_ID\\)===discordId/);
 assert.match(route,/if\\(managed\\)trainingApprovedGrant=managed/);
 assert.match(route,/canLogTraining\\(scoped,dept,\\{\\}\\)/);
 assert.match(route,/permissions:Object\\.fromEntries\\(SERVICE_DEPTS\\.map/);
});
test('Tijdelijke opleidingsmachtiging is dienstgebonden en verloopt; geen rangverhoging',()=>{
 const base={fresh:true,departments:['brandweer'],permissions:{
  brandweer:{'training.log':false,'training.review':false}}};
 const now=Date.UTC(2026,10,19);
 const granted=effectivePermissions(base,{departments:{brandweer:{
  'training.log':{action:'allow',expiresOn:'2026-11-20'}}}},now);
 assert.equal(granted.brandweer['training.log'],true);
 assert.equal(canLogTraining(actor('brandweer','basiskader'),'brandweer',granted),true);
 assert.equal(canReviewTraining(actor('brandweer','basiskader'),'brandweer',granted),false);
 const expired=effectivePermissions(base,{departments:{brandweer:{
  'training.log':{action:'allow',expiresOn:'2026-11-18'}}}},now);
 assert.equal(expired.brandweer['training.log'],false);
 const foreign=effectivePermissions(base,{departments:{ambulance:{
  'training.log':{action:'allow',expiresOn:'2026-11-20'}}}},now);
 assert.notEqual(foreign.ambulance['training.log'],true);
 const stale=effectivePermissions({...base,fresh:false},{departments:{brandweer:{
  'training.log':{action:'allow',expiresOn:'2026-11-20'}}}},now);
 assert.equal(stale.brandweer['training.log'],false);
 const route=file('src/role-routes.js');
 assert.match(route,/verifiedRole\|\|/);
 assert.match(route,/canLogTraining\(bpd,dept,perms\)/);
});
test('Beide registratieplaatsen gebruiken één beveiligde opleidings-API',()=>{
 const center=file('public/rollen-opleidingen.html'),dossier=file('public/personeelsbeheer.html');
 const routes=file('src/role-routes.js');
 assert.match(center,/url='\/api\/training'/);
 assert.match(dossier,/'\/api\/training'/);
 assert.match(center,/coursesForDepartment\(dept\)/);
 assert.match(dossier,/coursesForDepartment\(dept\)/);
 assert.match(center,/\{value:'ANDERE',text:'ANDERE \(zelf invullen\)'\}/);
 assert.match(dossier,/\{value:'ANDERE',label:'ANDERE \(zelf invullen\)'\}/);
 assert.match(routes,/await findSubject\(data.department,data.subjectDiscordId\)/);
 assert.match(routes,/mayAccessSubject\(actor,subject,await verifiedSubjects\(\[subject\]\)\)/);
 assert.match(routes,/status:'geregistreerd'/);
 assert.match(routes,/tx\.create\(ref\.collection\('audit'\)/);
});
test('Alle resultaatstatussen komen in dossier, weekrapport en bevoegd leidingoverzicht',()=>{
 const report=file('src/management-routes.js'),dashboard=file('public/voltooide-opleidingen.html');
 const view=file('public/weekrapporten.html'),exportDoc=file('src/report-export.js');
 const dossier=file('public/personeelsbeheer.html'),summary=file('src/training-completion-overview.js');
 assert.match(report,/TRAINING_RESULT_LABELS\[r\.result\]/);
 for(const name of ['present','passed','failed','interrupted']){
  assert.ok(report.includes(name+':official.filter'));
  assert.ok(dashboard.includes('id="'+(name==='passed'?'passedCount':name==='present'?'presentCount':name==='failed'?'failedCount':'interruptedCount')+'"'));
 }
 assert.match(view,/Onderbroken opleidingen/);
 assert.match(exportDoc,/onderbroken/);
 assert.match(summary,/isTrainingResult\(record\.result\)/);
 assert.match(dossier,/sheetSetRows\('training',(?:data\.records\|\|\[\]|completed)/);
});
test('Opleidingsregistratie heeft geen automatische rang- of rolwijziging',()=>{
 const routes=file('src/role-routes.js');
 assert.match(routes,/discordRoleUpdated:false,googleSheetsUpdated:false/);
 assert.match(routes,/validateMaintenanceReason/);
});
