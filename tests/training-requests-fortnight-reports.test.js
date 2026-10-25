import test from 'node:test';
import assert from 'node:assert/strict';
import {
 policeRequestTier,personSeries,requestCourseOptions,
 canSubmitTrainingRequest,mayReviewTrainingRequest,validateTrainingRequestInput,
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
test('reekshoofden see only basic requests in their own series; officers see middle cadre',()=>{
 const req={department:'politie',series:'03',applicantDiscordId:'888888888888888888',applicantTier:'basiskader'};
 const lead={discordId:'1103170819355574328',departments:['politie'],departmentRoles:{politie:'basiskader'},role:'basiskader'};
 assert.equal(mayReviewTrainingRequest(lead,req),true);
 assert.equal(mayReviewTrainingRequest(lead,{...req,series:'01'}),false);
 assert.equal(mayReviewTrainingRequest(lead,{...req,applicantTier:'middenkader'}),false);
 assert.equal(mayReviewTrainingRequest(high,{...req,applicantTier:'middenkader'}),true);
 assert.equal(mayReviewTrainingRequest({...high,discordId:req.applicantDiscordId},req),false);
 assert.equal(mayReviewTrainingRequest({role:'officierenkader',departments:['ambulance'],
   departmentRoles:{ambulance:'officierenkader'},discordId:high.discordId},req),false);
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
 assert.equal(mayReadFortnightReport(own,'politie',roster),false);
 // A generic medical cadre does not prove AZLS leadership.
 assert.equal(mayReadFortnightReport(own,'ambulance',roster),false);
 assert.equal(mayReadFortnightReport(own,'brandweer',roster),false);
 assert.equal(mayReadFortnightReport(own,'depannage',roster),true);
 assert.deepEqual(fortnightReportDepartments(own,roster),['depannage']);
 assert.equal(mayReadFortnightReport({...own,fireZoneChief:true},'brandweer',roster),true);
 assert.equal(mayReadFortnightReport({...own,reportServiceRoles:{ambulanceAzls:true}},'ambulance',roster),true);
 assert.equal(mayReadFortnightReport(own,'ambulance',
   [{dept:'ambulance',personId:own.discordId,call:'DIRMED'},...roster.slice(1)]),true);
 assert.equal(mayReadFortnightReport({...own,departmentRoles:{...own.departmentRoles,depannage:'basiskader'}},'depannage',roster),true);
 assert.equal(mayReadFortnightReport({...own,uid:'discord:999999999999999999'},'depannage',roster),false);
});