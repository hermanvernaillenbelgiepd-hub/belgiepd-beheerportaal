import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 isVerifiedReportCorpsReader,fortnightReportDepartments,mayReadFortnightReport,
 mayRemoveWeekReport
} from '../src/fortnight-report-policy.js';
import {canReadServiceDossier} from '../src/service-dossier-access.js';

const ID='666666666666666666';
const services=['politie','ambulance','brandweer','depannage'];
const corps={
 uid:'discord:'+ID,discordId:ID,role:'korpsleiding',
 departments:['politie'],departmentRoles:{politie:'korpsleiding'},
 discordPoliceRank:'korpsleiding',dossierSourceFresh:true,
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']
};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('independently verified Korpsleiding reads all four current and archived report scopes',()=>{
 assert.equal(isVerifiedReportCorpsReader(corps),true);
 assert.deepEqual(fortnightReportDepartments(corps,[]),services);
 for(const dept of services)
  assert.equal(mayReadFortnightReport(corps,dept,[]),true);
});

test('cross-service report observation never widens dossier access or write/delete rights',()=>{
 for(const dept of services){
  assert.equal(canReadServiceDossier(corps,dept),dept==='politie');
  assert.equal(mayRemoveWeekReport(corps,dept,[]),dept==='politie');
 }
 const routes=read('src/management-routes.js');
 assert.match(routes,/reportDepartments=fortnightReportDepartments\(req\.bpd,snap\.data\)/);
 assert.match(routes,/isVerifiedReportCorpsReader\(req\.bpd\)/);
 assert.match(routes,/!mayReadFortnightReport\(req\.bpd,dept,snapshot\.data\)/);
 assert.match(routes,/!mayReadFortnightReport\(req\.bpd,report\.dept,snap\.data\)/);
 assert.match(routes,/removeReportDepartments:enabled\(\)\?fortnightReportDepartments/);
 assert.match(routes,/!req\.bpd\.dossierNativeDepartments\?\.includes\(r\.dept\)/);
 assert.match(routes,/!mayRemoveWeekReport\(req\.bpd,report\.dept,snap\.data\)/);
});

test('unverified, non-Police or stale Corps labels do not unlock other services',()=>{
 const denied=[
 {...corps,discordPoliceRank:null},
 {...corps,dossierSourceFresh:false},
 {...corps,uid:'discord:111111111111111111'},
 {...corps,discordId:'invalid'},
 {...corps,role:'officierenkader'},
 {...corps,departmentRoles:{politie:'officierenkader'}},
 {...corps,departments:['ambulance']},
 {...corps,portalTechnicalMode:true,profileTechnicalAvailable:false}
 ];
 for(const actor of denied){
  assert.equal(isVerifiedReportCorpsReader(actor),false);
  assert.equal(mayReadFortnightReport(actor,'brandweer',[]),false);
 }
});
test('separately approved manual Korpsleiding recovery grants read only, not deletion',()=>{
 const manual={...corps,discordPoliceRank:null,manualCorpsApproved:true};
 assert.equal(isVerifiedReportCorpsReader(manual),true);
 assert.deepEqual(fortnightReportDepartments(manual,[]),services);
 for(const dept of ['brandweer','ambulance','depannage'])
  assert.equal(mayRemoveWeekReport(manual,dept,[]),false);
});
