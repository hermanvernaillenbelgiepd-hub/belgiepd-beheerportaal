import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {policeOperationalTier,policeGroupedRoster,policeTierDisplay}
 from '../public/police-roster-cadre.js';
import {policeRosterSeriesBadges} from '../public/police-roster-series.js';
import {mayRegisterCentralManualLeave,validateManualLeaveRequest,rosterPoliceRole}
 from '../src/leave-policy.js';
import {serviceIdentity} from '../public/dossier-service-badge.js';

const discordId='111111111111111111';
const staff=(call,rank)=>({dept:'politie',call,rank:rank||'',discordId});
const actor=(role,departments=['politie'])=>({
 discordId,role,departments,departmentRoles:{politie:role}
});
test('Police list gets five operational divider groups with the original order inside each tier',()=>{
 const rows=[
  staff('900'),staff('910'),staff('920'),staff('950'),
  staff('600'),staff('700'),staff('800'),staff('300'),staff('500'),
  staff('100'),staff('299')
 ];
 assert.deepEqual(policeGroupedRoster(rows).map(([tier,people])=>[tier,people.length]),[
  ['korpsleiding',2],['officierenkader',2],['middenkader',3],
  ['basiskader',2],['agentenkader',2]
 ]);
 for(const group of ['korpsleiding','officierenkader','middenkader','basiskader','agentenkader'])
  assert.ok(policeTierDisplay(group).label.toUpperCase().includes(group.toUpperCase()));
 assert.equal(policeOperationalTier(staff('008')),'overig');
 assert.equal(policeOperationalTier({dept:'ambulance',call:'800'}),null);
});
test('Individual Police cells show series colors and role icons, not cadre or head labels',()=>{
 const mid=staff('700');mid.series='Reeks 1';
 assert.deepEqual(policeRosterSeriesBadges(mid,'Reeks 1 · Middenkader')
  .map(x=>x.label),['Reeks 1']);
 const officer=staff('925');
 assert.deepEqual(policeRosterSeriesBadges(officer,'Officierenkader / Korpsleiding')
  .map(x=>x.label),['🌈']);
});
test('Manual leave permits Police cadre across all services, never other department cadre',()=>{
 assert.equal(mayRegisterCentralManualLeave(actor('middenkader'),
  '222222222222222222',1),true);
 assert.equal(mayRegisterCentralManualLeave(actor('middenkader'),
  '222222222222222222',30),true);
 assert.equal(mayRegisterCentralManualLeave(actor('middenkader'),
  '222222222222222222',31),false);
 assert.equal(mayRegisterCentralManualLeave(actor('officierenkader'),
  '222222222222222222',31),true);
 assert.equal(mayRegisterCentralManualLeave(actor('middenkader'),
  '222222222222222222',1,'middenkader',true),false);
 assert.equal(mayRegisterCentralManualLeave(actor('korpsleiding'),
  '222222222222222222',1,'officierenkader',true),true);
 assert.equal(mayRegisterCentralManualLeave(actor('korpsleiding'),
  '222222222222222222',1,'korpsleiding',true),false);
 assert.equal(mayRegisterCentralManualLeave(actor('middenkader'),
  discordId,1),false);
 const fire={...actor('middenkader',['brandweer']),departmentRoles:{brandweer:'middenkader'}};
 assert.equal(mayRegisterCentralManualLeave(fire,'222222222222222222',1),false);
 assert.equal(rosterPoliceRole(staff('700')),'middenkader');
 assert.equal(rosterPoliceRole(staff('400')),'basiskader');
});
test('Manual leave permits any 1-730-day interval and does not change ordinary request minimum',()=>{
 assert.deepEqual(validateManualLeaveRequest({
  startDate:'2026-10-25',endDate:'2026-10-25',note:'test'
 }),{startDate:'2026-10-25',endDate:'2026-10-25',days:1,note:'test'});
 assert.throws(()=>validateManualLeaveRequest({
  startDate:'2026-10-25',endDate:'2026-10-24'
 }));
});
test('Dossier page visibly names the target service in the header and registration form',()=>{
 for(const dept of ['politie','brandweer','ambulance','depannage']){
  assert.notEqual(serviceIdentity(dept).label,'ONBEKENDE HULPDIENST');
 }
 const sheet=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const fire=readFileSync(new URL('../public/brandweerdossier.html',import.meta.url),'utf8');
 assert.match(sheet,/id="dossierServiceBanner"/);
 assert.match(sheet,/id="registrationServiceBanner"/);
 assert.match(fire,/id="dossierServiceBanner"/);
 assert.match(fire,/id="registrationServiceBanner"/);
 assert.match(fire,/id="fireManualLeaveForm"/);
 assert.match(sheet,/activeLeaveRosterIds\.has\(person\.discordId\)/);
 assert.match(sheet,/police-kader-divider/);
 assert.match(sheet,/if\(registrationManualLeave\)kinds\.push\(\['leave'/);
 const leaveApi=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
 assert.match(leaveApi,/manual_central_/);
 assert.match(leaveApi,/subjectDepartments:departments/);
 assert.match(leaveApi,/action:'manual_approved'/);
 assert.match(leaveApi,/leave\/roster-active/);
});
