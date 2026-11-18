import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadServiceDossier} from '../src/service-dossier-access.js';
import {canReadPersonnelSubject,canEditPersonnel} from '../src/personnel-editor-policy.js';
import {mayApproveLeave} from '../src/leave-policy.js';
import {mayReviewTrainingRequest,mayInstructorReviewTrainingRequest} from '../src/training-request-policy.js';
import {canManagePoliceDecoration} from '../src/personnel-decoration-policy.js';
import {canAccessCitizenDossier} from '../src/citizen-dossier-policy.js';
import {canManageLifecycleDepartment} from '../src/personnel-lifecycle-access.js';
const self='111111111111111111',subjectId='222222222222222222';
const actor=(dept,role)=>({uid:'discord:'+self,discordId:self,
 role,departments:[dept],departmentRoles:{[dept]:role},
 dossierAllowedDepartments:[dept],dossierNativeDepartments:[dept]});
const person=(dept,call='411',rank='Inspecteur',personId=subjectId)=>
 ({dept,call,rank,personId,name:'Fictief testlid'});
const req=(dept,tier='basiskader')=>({department:dept,
 applicantDiscordId:subjectId,applicantTier:tier,courseName:'K-9'});
test('900/910 blijven afgeschermd, normale INP-dossiers niet',()=>{
 const officer=actor('politie','officierenkader');
 const corps={...actor('politie','korpsleiding'),discordPoliceRank:'korpsleiding'};
 assert.equal(canReadServiceDossier(officer,'politie'),true);
 assert.equal(canReadPersonnelSubject(officer,person('politie','411')),true);
 for(const call of ['900','910']){
  assert.equal(canReadPersonnelSubject(officer,person('politie',call,'Hoofdcommissaris')),false);
  assert.equal(canReadPersonnelSubject(corps,person('politie',call,'Hoofdcommissaris')),true);
 }
 assert.equal(canReadServiceDossier(actor('politie','basiskader'),'politie'),false);
 assert.equal(canReadPersonnelSubject(actor('politie','basiskader'),person('politie','411')),false);
});
test('ereteken nooit aan jezelf en nooit op basis van burger- of andere dienstrol',()=>{
 const officer=actor('politie','officierenkader');
 assert.equal(canManagePoliceDecoration(officer,person('politie')),true);
 assert.equal(canManagePoliceDecoration(officer,person('politie','411','Inspecteur',self)),false);
 assert.equal(canManagePoliceDecoration(actor('ambulance','officierenkader'),person('politie')),false);
});
test('opleidings- en verlofrechten zijn lager-kader- en dienstgebonden',()=>{
 const middle=actor('politie','middenkader');
 const officer=actor('politie','officierenkader');
 const teacher=actor('politie','basiskader');
 assert.equal(mayReviewTrainingRequest(middle,req('politie')),true);
 assert.equal(mayReviewTrainingRequest(middle,req('politie','middenkader')),false);
 assert.equal(mayInstructorReviewTrainingRequest(teacher,req('politie'),['1345302115689431061']),true);
 assert.equal(mayInstructorReviewTrainingRequest(teacher,
  {...req('politie'),courseName:'MOTARD'},['1345302115689431061']),false);
 assert.equal(mayReviewTrainingRequest(officer,req('ambulance')),false);
 const leave=(days)=>({status:'pending',personDiscordId:subjectId,
  subjectDepartments:['politie'],subjectDepartmentRoles:{politie:'basiskader'},
  startDate:'2027-03-01',endDate:'2027-03-'+String(days).padStart(2,'0')});
 assert.equal(mayApproveLeave(middle,leave(10),null),true);
 assert.equal(mayApproveLeave(middle,{...leave(10),startDate:'2027-02-01',
  endDate:'2027-03-10'},null),false);
 assert.equal(mayApproveLeave(officer,{...leave(10),startDate:'2027-02-01',
  endDate:'2027-03-10'},null),true);
 assert.equal(mayApproveLeave(actor('brandweer','korpsleiding'),leave(10),null),false);
});
test('burgerdossiers en personeelsarchief zonder eigen toelating niet open',()=>{
 const officer=actor('politie','officierenkader');
 const corps={...actor('politie','korpsleiding'),discordPoliceRank:'korpsleiding'};
 assert.equal(canAccessCitizenDossier(officer,false),false);
 assert.equal(canAccessCitizenDossier(corps,false),true);
 assert.equal(canManageLifecycleDepartment(actor('politie','basiskader'),'politie'),false);
 assert.equal(canManageLifecycleDepartment(actor('ambulance','officierenkader'),'politie'),false);
});
