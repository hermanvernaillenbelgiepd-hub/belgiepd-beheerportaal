import test from 'node:test';
import assert from 'node:assert/strict';
import {
 policeRequestTier,personSeries,requestCourseOptions,
 canSubmitTrainingRequest,mayReviewTrainingRequest,mayInstructorReviewTrainingRequest,validateTrainingRequestInput,
 nextTrainingRequestStatus
} from '../src/training-request-policy.js';
import {
 fortnightFor,automaticFortnightReports,parseAutomaticReportId,
 mayReadFortnightReport,fortnightReportDepartments
} from '../src/fortnight-report-policy.js';

const police=(call='225')=>({dept:'politie',call,seriesRaw:'03',name:'Test'});
const high={discordId:'777777777777777777',departments:['politie'],
 role:'officierenkader',departmentRoles:{politie:'officierenkader'}};
test('agent, basic and middle-cadre are separated by real callsigns',()=>{
 assert.equal(policeRequestTier(police('150')),'agentenkader');
 assert.equal(policeRequestTier(police('225')),'agentenkader');
 assert.equal(policeRequestTier(police('S345')),'basiskader');
 assert.equal(policeRequestTier(police('S645')),'middenkader');
 assert.equal(personSeries(police()),'03');
 assert.equal(policeRequestTier(police('S955')),null);
});
test('course vocabularies are scoped by service and middle cadre enters free text',()=>{
 assert.ok(requestCourseOptions('politie','agentenkader').includes('RAGO'));
 assert.ok(requestCourseOptions('ambulance',null).includes('MEDICATIE'));
 assert.ok(requestCourseOptions('brandweer',null).includes('Duiker'));
 assert.ok(requestCourseOptions('depannage',null).includes('F.A.S.T'));
 assert.deepEqual(requestCourseOptions('politie','middenkader'),[]);
 assert.deepEqual(validateTrainingRequestInput({course:'VARIA',varia:'Bijscholing dispatch',note:''},[],'middenkader'),
   {courseName:'Bijscholing dispatch',isVaria:true,note:''});
 assert.throws(()=>validateTrainingRequestInput({course:'GEHEIM',note:''},
   requestCourseOptions('politie','agentenkader'),'agentenkader'));
 assert.equal(canSubmitTrainingRequest(police('S650'),'middenkader','basiskader'),false);
 assert.equal(canSubmitTrainingRequest(police('S650'),'middenkader','middenkader'),true);
});
test('police middle cadre can review lower rank training regardless of series',()=>{
 const req={department:'politie',series:'03',applicantDiscordId:'888888888888888888',applicantTier:'basiskader'};
 const middle={discordId:'1103170819355574328',departments:['politie'],departmentRoles:{politie:'middenkader'},role:'middenkader'};
 assert.equal(mayReviewTrainingRequest(middle,req),true);
 assert.equal(mayReviewTrainingRequest(middle,{...req,series:'01'}),true);
 assert.equal(mayReviewTrainingRequest(middle,{...req,applicantTier:'middenkader'}),false);
 assert.equal(mayReviewTrainingRequest(high,{...req,applicantTier:'middenkader'}),true);
 assert.equal(mayReviewTrainingRequest(high,{...req,applicantTier:'officierenkader'}),false);
 assert.equal(mayReviewTrainingRequest({...high,discordId:req.applicantDiscordId},req),false);
 assert.equal(mayReviewTrainingRequest({role:'officierenkader',departments:['ambulance'],
   departmentRoles:{ambulance:'officierenkader'},discordId:high.discordId},req),false);
});
test('specialization instructors cannot review other specialization requests',()=>{
 const officer={discordId:'333333333333333333',departments:['politie'],departmentRoles:{politie:'basiskader'},role:'basiskader'};
 const request={department:'politie',applicantDiscordId:'888888888888888888',applicantTier:'basiskader'};
 assert.equal(mayInstructorReviewTrainingRequest(officer,{...request,courseName:'K-9'},['1345302115689431061']),true);
 assert.equal(mayInstructorReviewTrainingRequest(officer,{...request,courseName:'MOTARD'},['1345302115689431061']),false);
 assert.equal(mayInstructorReviewTrainingRequest(officer,{...request,courseName:'K-9',applicantTier:'middenkader'},['1345302115689431061']),false);
 assert.equal(mayInstructorReviewTrainingRequest(officer,{...request,courseName:'K-9',applicantDiscordId:officer.discordId},['1345302115689431061']),false);
 assert.equal(mayInstructorReviewTrainingRequest({...officer,departments:['brandweer']},{...request,courseName:'K-9'},['1345302115689431061']),false);
});
test('the distinct read, given and archived actions preserve a monotone record',()=>{
 assert.equal(nextTrainingRequestStatus('nieuw','gelezen'),'gelezen');
 assert.equal(nextTrainingRequestStatus('gelezen','gegeven'),'gegeven');
 assert.equal(nextTrainingRequestStatus('nieuw','gegeven'),'gegeven');
 assert.equal(nextTrainingRequestStatus('gegeven','wissen'),'gewist');
 assert.throws(()=>nextTrainingRequestStatus('gegeven','gelezen'));
 assert.throws(()=>nextTrainingRequestStatus('gewist','gegeven'));
});
test('automatic reporting is anchored on Monday and covers 14 inclusive calendar days',()=>{
 const before=fortnightFor('2026-10-25','politie');
 const after=fortnightFor('2026-10-26','politie');
 assert.deepEqual([before.periodStart,before.periodEnd],['2026-10-12','2026-10-25']);
 assert.deepEqual([after.periodStart,after.periodEnd],['2026-10-26','2026-11-08']);
 assert.equal(parseAutomaticReportId(before.id).periodStart,'2026-10-12');
 assert.equal(parseAutomaticReportId('Fpolitie20261019'),null);
 assert.equal(automaticFortnightReports('brandweer','2026-11-01',2).length,2);
});
test('fortnight report permissions are proved separately for each service',()=>{
 const own={uid:'discord:444444444444444444',discordId:'444444444444444444',role:'middenkader',
   departments:['politie','ambulance','brandweer','depannage'],
   departmentRoles:{politie:'middenkader',ambulance:'middenkader',brandweer:'basiskader',depannage:'middenkader'}};
 const roster=[
   {dept:'ambulance',personId:own.discordId,call:'AMB-105'},
   {dept:'brandweer',personId:own.discordId,call:'BWM-205'},
   {dept:'depannage',personId:own.discordId,call:'AWV-105'}
 ];
 assert.equal(mayReadFortnightReport(own,'politie',roster),true);
 // A generic medical cadre does not prove AZLS leadership.
 assert.equal(mayReadFortnightReport(own,'ambulance',roster),false);
 assert.equal(mayReadFortnightReport(own,'brandweer',roster),false);
 assert.equal(mayReadFortnightReport(own,'depannage',roster),true);
 assert.deepEqual(fortnightReportDepartments(own,roster),['politie','depannage']);
 assert.equal(mayReadFortnightReport({...own,fireZoneChief:true},'brandweer',roster),true);
 assert.equal(mayReadFortnightReport({...own,reportServiceRoles:{ambulanceAzls:true}},'ambulance',roster),true);
 assert.equal(mayReadFortnightReport(own,'ambulance',
   [{dept:'ambulance',personId:own.discordId,call:'DIRMED'},...roster.slice(1)]),true);
 assert.equal(mayReadFortnightReport({...own,departmentRoles:{...own.departmentRoles,depannage:'basiskader'}},'depannage',roster),true);
 assert.equal(mayReadFortnightReport({...own,uid:'discord:999999999999999999'},'depannage',roster),false);
});
test('service leadership may grant specialization training while instructors stay specialization-scoped',()=>{
 const policeRequest={department:'politie',courseName:'K-9',
  applicantDiscordId:'888888888888888888',applicantTier:'basiskader'};
 const mk={discordId:'333333333333333333',role:'middenkader',
  departments:['politie'],departmentRoles:{politie:'middenkader'}};
 assert.equal(mayReviewTrainingRequest(mk,policeRequest),true);
 assert.equal(mayReviewTrainingRequest(high,{...policeRequest,courseName:'MOTARD'}),true);
 const corps={...high,role:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}};
 assert.equal(mayReviewTrainingRequest(corps,{...policeRequest,courseName:'RAGO'}),true);
 assert.equal(mayReviewTrainingRequest({...mk,discordId:policeRequest.applicantDiscordId},policeRequest),false);
 const k9Teacher={...mk,role:'basiskader',departmentRoles:{politie:'basiskader'}};
 assert.equal(mayReviewTrainingRequest(k9Teacher,policeRequest),false);
 assert.equal(mayInstructorReviewTrainingRequest(k9Teacher,policeRequest,
  ['1345302115689431061']),true);
 assert.equal(mayInstructorReviewTrainingRequest(k9Teacher,
  {...policeRequest,courseName:'RAGO'},['1345302115689431061']),false);
 for(const dept of ['ambulance','brandweer','depannage']){
  const boss={...high,departments:[dept],departmentRoles:{[dept]:'officierenkader'}};
  const req={department:dept,courseName:'Dienstspecialisatie',
   applicantDiscordId:policeRequest.applicantDiscordId,applicantTier:'basiskader'};
  assert.equal(mayReviewTrainingRequest(boss,req),true);
  assert.equal(mayReviewTrainingRequest({...high,departments:['politie']},req),false);
  assert.equal(mayReviewTrainingRequest({...boss,discordId:req.applicantDiscordId},req),false);
 }
});
