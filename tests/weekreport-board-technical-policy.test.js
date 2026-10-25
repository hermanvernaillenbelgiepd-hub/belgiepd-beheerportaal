import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 fortnightReportDepartments,mayReadFortnightReport,mayRemoveWeekReport,
 isVerifiedReportTechnicalAdmin
} from '../src/fortnight-report-policy.js';

const ID='111111111111111111';
const depts=['politie','ambulance','brandweer','depannage'];
const ordinary={uid:'discord:'+ID,discordId:ID,
  role:'officierenkader',departments:['politie','ambulance'],
  departmentRoles:{politie:'officierenkader',ambulance:'basiskader'}};
const board={...ordinary,role:'basiskader',
  departmentRoles:{politie:'basiskader',ambulance:'basiskader'},
  boardPersonnelAdmin:true,dossierAllowedDepartments:depts};
const tech={...ordinary,role:'beheerder',portalTechnicalMode:true,
  profileTechnicalAvailable:true,departments:depts,
  dossierAllowedDepartments:depts};

test('verified Bestuur sees all four service reports and archives, but cannot erase them',()=>{
 assert.deepEqual(fortnightReportDepartments(board,[]),depts);
 for(const dept of depts){
  assert.equal(mayReadFortnightReport(board,dept,[]),true);
  assert.equal(mayRemoveWeekReport(board,dept,[]),false);
 }
 assert.equal(isVerifiedReportTechnicalAdmin(board),false);
});

test('signed technical administration session may see, erase and restart all four service reports',()=>{
 assert.equal(isVerifiedReportTechnicalAdmin(tech),true);
 assert.deepEqual(fortnightReportDepartments(tech,[]),depts);
 for(const dept of depts){
  assert.equal(mayReadFortnightReport(tech,dept,[]),true);
  assert.equal(mayRemoveWeekReport(tech,dept,[]),true);
 }
});

test('client flags, invalid identity and missing technical approval never confer technical report deletion',()=>{
 for(const invalid of [
  {...tech,profileTechnicalAvailable:false},
  {...tech,portalTechnicalMode:false},
  {...tech,uid:'discord:999999999999999999'},
  {...tech,discordId:'not-a-discord-id'},
  {...tech,role:'beheerder',departments:['politie'],dossierAllowedDepartments:depts,
    portalTechnicalMode:false,profileTechnicalAvailable:false}
 ]){
  assert.equal(isVerifiedReportTechnicalAdmin(invalid),false);
  assert.equal(mayRemoveWeekReport(invalid,'ambulance',[]),false);
  assert.equal(mayRemoveWeekReport(invalid,'brandweer',[]),false);
 }
 assert.deepEqual(fortnightReportDepartments({...board,boardPersonnelAdmin:false},[]),['politie'].filter(d=>mayReadFortnightReport({...board,boardPersonnelAdmin:false},d,[])));
 assert.equal(mayReadFortnightReport({...board,uid:'discord:999999999999999999'},'brandweer',[]),false);
});

test('police officer and corps keep only their original police authority',()=>{
 const officer={...ordinary,departments:['politie'],
  departmentRoles:{politie:'officierenkader'}};
 const corps={...officer,role:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}};
 for(const p of [officer,corps]){
  assert.equal(mayRemoveWeekReport(p,'politie',[]),true);
  for(const d of ['brandweer','ambulance','depannage']){
   assert.equal(mayRemoveWeekReport(p,d,[]),false);
   assert.equal(mayReadFortnightReport(p,d,[]),false);
  }
 }
});

test('report APIs require both server-verified department scope and scoped policy',()=>{
 const source=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/req\.bpd\.boardPersonnelAdmin=Boolean\(valid&&req\.bpd\.uid==='discord:'\+id/);
 assert.match(source,/reportDepartments:fortnightReportDepartments\(/);
 assert.match(source,/removeReportDepartments:enabled\(\)\?fortnightReportDepartments\(/);
 assert.match(source,/!canReadServiceDossier\(req\.bpd,dept\)\|\|/);
 assert.match(source,/!mayReadFortnightReport\(req\.bpd,dept,snapshot\.data\)/);
 assert.match(source,/!mayRemoveWeekReport\(req\.bpd,report\.dept,snap\.data\)/);
 assert.match(source,/const reportAuditActor=\(request,roster\)=>actorFromPersonnel/);
 assert.match(source,/isVerifiedReportTechnicalAdmin\(request\.bpd\)/);
 assert.match(source,/tx\.create\(audit,\{action:'automatic_report_restarted'/);
 assert.match(source,/await marker\.create\(/);
});
