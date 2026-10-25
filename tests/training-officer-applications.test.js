import test from 'node:test';
import assert from 'node:assert/strict';
import {
 policeRequestTier,canSubmitTrainingRequest,requestCourseOptions,
 validateTrainingRequestInput,mayReviewTrainingRequest
} from '../src/training-request-policy.js';

const officer={dept:'politie',call:'920',rank:'Aspirant Commissaris',kader:'Officierenkader / Korpsleiding'};
const commander={dept:'politie',call:'910',rank:'Eerste Commissaris',kader:'Korpsleiding'};

test('officer cadre has a training request tier based on the personnel roster',()=>{
 assert.equal(policeRequestTier(officer),'officierenkader');
 assert.equal(policeRequestTier({...officer,call:'930',rank:'—'}),'officierenkader');
 assert.equal(policeRequestTier(commander),'korpsleiding');
 assert.equal(policeRequestTier({...commander,call:'900'}),'korpsleiding');
 assert.equal(policeRequestTier({dept:'politie',call:'955'}),null);
 assert.equal(policeRequestTier({dept:'politie',call:'225'}),'agentenkader');
});

test('senior training applications require an explicitly approved senior role',()=>{
 assert.equal(canSubmitTrainingRequest(officer,policeRequestTier(officer),'officierenkader'),true);
 assert.equal(canSubmitTrainingRequest(officer,policeRequestTier(officer),'korpsleiding'),true);
 assert.equal(canSubmitTrainingRequest(commander,policeRequestTier(commander),'korpsleiding'),true);
 assert.equal(canSubmitTrainingRequest(officer,policeRequestTier(officer),'basiskader'),false);
 assert.equal(canSubmitTrainingRequest(officer,policeRequestTier(officer),null),false);
});

test('officer cadre can select a course or request VARIA',()=>{
 const options=requestCourseOptions('politie','officierenkader');
 assert.ok(options.includes('RAGO'));
 assert.deepEqual(
  validateTrainingRequestInput({course:'RAGO',note:''},options,'officierenkader'),
  {courseName:'RAGO',isVaria:false,note:''}
 );
 assert.deepEqual(
  validateTrainingRequestInput({course:'VARIA',varia:'Bijscholing',note:''},options,'officierenkader'),
  {courseName:'Bijscholing',isVaria:true,note:''}
 );
});

test('a police officer cannot approve a personal training request',()=>{
 const actor={discordId:'123456789012345678',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},role:'officierenkader'};
 const request={department:'politie',applicantTier:'officierenkader',
  applicantDiscordId:actor.discordId};
 assert.equal(mayReviewTrainingRequest(actor,request),false);
 assert.equal(mayReviewTrainingRequest(actor,{...request,applicantDiscordId:'123456789012345679'}),true);
});
