import test from 'node:test';
import assert from 'node:assert/strict';
import {roleForDepartment} from '../src/leave-policy.js';
import {canSeeAdvancedDashboard} from '../src/dashboard-admin-policy.js';
import {mayReviewTrainingRequest,mayInstructorReviewTrainingRequest} from '../src/training-request-policy.js';
import {planningManager,planningTrack} from '../src/training-planning-policy.js';
import {personnelPingScopes} from '../src/personnel-ping-scope-policy.js';

const id='111111111111111111',other='222222222222222222';
const guildId='999999999999999999',now=Date.now();
const actor=(departmentRoles)=>({
 discordId:id,uid:'discord:'+id,
 role:Object.values(departmentRoles).includes('korpsleiding')?'korpsleiding':
   Object.values(departmentRoles).includes('officierenkader')?'officierenkader':
   Object.values(departmentRoles).includes('middenkader')?'middenkader':'basiskader',
 departments:Object.keys(departmentRoles),departmentRoles
});
const roleProof=(...roleIds)=>({guildId,verifiedAt:now,roleIds});
const request=(department,applicantTier='basiskader',courseName='MOTARD')=>({
 department,applicantDiscordId:other,applicantTier,courseName
});

test('Middenkader + Motard-instructeur keeps full Police cadre authority AND Motard teaching',()=>{
 const person=actor({politie:'middenkader'});
 assert.equal(roleForDepartment(person,'politie'),'middenkader');
 assert.equal(canSeeAdvancedDashboard(person),true);
 assert.equal(mayReviewTrainingRequest(person,request('politie')),true);
 assert.equal(mayInstructorReviewTrainingRequest(person,request('politie'),
  ['1359656762289946755']),true);
 assert.equal(mayInstructorReviewTrainingRequest(person,request('politie','basiskader','K-9'),
  ['1359656762289946755']),false);
 assert.equal(planningManager(person,planningTrack('politie:motard'),[]),true);
 assert.deepEqual(personnelPingScopes(person,roleProof(
  '1335578488664490057','1359656762289946755'),guildId,now),
  {all:false,departments:['politie']});
});

test('Brandweer Middenkader + Brandweer instructeur keeps both rights, no Police powers',()=>{
 const person=actor({brandweer:'middenkader',politie:'basiskader'});
 assert.equal(roleForDepartment(person,'brandweer'),'middenkader');
 assert.equal(roleForDepartment(person,'politie'),'basiskader');
 assert.equal(mayReviewTrainingRequest(person,request('brandweer')),true);
 assert.equal(mayInstructorReviewTrainingRequest(person,request('brandweer'),['1309532437952466989']),true);
 assert.equal(planningManager(person,planningTrack('brandweer:algemeen'),[]),true);
 assert.equal(mayReviewTrainingRequest(person,request('politie')),false);
 assert.deepEqual(personnelPingScopes(person,
  roleProof('1554906632897560787','1309532437952466989'),
  guildId,now),{all:false,departments:['brandweer']});
});

test('AZLS leadership + medical instructor keeps its own service authority only',()=>{
 const person=actor({ambulance:'officierenkader',brandweer:'basiskader'});
 assert.equal(roleForDepartment(person,'ambulance'),'officierenkader');
 assert.equal(roleForDepartment(person,'brandweer'),'basiskader');
 assert.equal(mayReviewTrainingRequest(person,request('ambulance')),true);
 assert.equal(mayInstructorReviewTrainingRequest(person,request('ambulance'),['1309532437952466988']),true);
 assert.equal(planningManager(person,planningTrack('ambulance:algemeen'),[]),true);
 assert.equal(mayReviewTrainingRequest(person,request('brandweer')),false);
 assert.deepEqual(personnelPingScopes(person,
  roleProof('1309532438053130325','1309532437952466988'),guildId,now),
  {all:false,departments:['ambulance']});
});

test('AWV/Depannage and Burgerraad roles remain scoped, not global cadre promotions',()=>{
 const depannage=actor({depannage:'middenkader',politie:'basiskader'});
 assert.equal(mayReviewTrainingRequest(depannage,request('depannage')),true);
 assert.equal(mayReviewTrainingRequest(depannage,request('politie')),false);
 assert.equal(planningManager(depannage,planningTrack('depannage:algemeen'),[]),true);
 assert.deepEqual(personnelPingScopes(depannage,roleProof('1309532438019706969'),
  guildId,now),{all:false,departments:['depannage']});
 const burger=actor({burger:'basiskader',politie:'basiskader'});
 assert.equal(roleForDepartment(burger,'burger'),'basiskader');
 assert.deepEqual(personnelPingScopes(burger,roleProof('1492485336197234728'),
  guildId,now),{all:false,departments:['burger']});
 assert.equal(mayReviewTrainingRequest(burger,request('politie')),false);
});

test('a higher Police rank never upgrades a lower secondary department',()=>{
 const person=actor({politie:'korpsleiding',ambulance:'basiskader'});
 assert.equal(roleForDepartment(person,'politie'),'korpsleiding');
 assert.equal(roleForDepartment(person,'ambulance'),'basiskader');
 assert.equal(mayReviewTrainingRequest(person,request('ambulance')),false);
 assert.equal(mayReviewTrainingRequest(person,request('politie','middenkader')),true);
 assert.equal(mayInstructorReviewTrainingRequest(person,request('ambulance'),
  ['1359656762289946755']),false);
});
