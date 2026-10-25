import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSubmitTrainingRequest,policeRequestTier,requestCourseOptions,
  validateTrainingRequestInput,mayReviewTrainingRequest
} from '../src/training-request-policy.js';

const officer={dept:'politie',personId:'123456789012345678',call:'920',
  rank:'Aspirant Commissaris',kader:'Officierenkader / Korpsleiding'};
const special={...officer,call:'008',rank:'Technisch beheer'};

test('verified staff may file own training requests without a separate admin grant',()=>{
  const tier=policeRequestTier(officer);
  assert.equal(tier,'officierenkader');
  assert.equal(canSubmitTrainingRequest(officer,tier,null),false);
  assert.equal(canSubmitTrainingRequest(officer,tier,null,true),true);
  assert.equal(canSubmitTrainingRequest(special,policeRequestTier(special),null,true),true);
  assert.equal(canSubmitTrainingRequest({...officer,call:'650'},'middenkader',null,true),true);
  assert.equal(canSubmitTrainingRequest(officer,tier,'basiskader',false),false);
  assert.equal(canSubmitTrainingRequest(null,tier,null,true),false);
  assert.equal(canSubmitTrainingRequest({...officer,dept:'burger'},tier,null,true),false);
});

test('self-service does not imply access to review or complete other requests',()=>{
  const actor={discordId:officer.personId,departments:[],departmentRoles:{}};
  const request={department:'politie',applicantDiscordId:'999999999999999999',
    applicantTier:'agentenkader',series:'03'};
  assert.equal(mayReviewTrainingRequest(actor,request),false);
  const ownActor={...actor,role:'officierenkader',departments:['politie'],
    departmentRoles:{politie:'officierenkader'}};
  assert.equal(mayReviewTrainingRequest(ownActor,{...request,applicantDiscordId:officer.personId}),false);
});

test('personal requests still validate the selected course or VARIA server-side',()=>{
  const options=requestCourseOptions('politie','officierenkader');
  assert.deepEqual(validateTrainingRequestInput({course:'RAGO',note:''},options,'officierenkader'),
    {courseName:'RAGO',isVaria:false,note:''});
  assert.throws(()=>validateTrainingRequestInput({course:'NOT_A_COURSE'},options,'officierenkader'));
  assert.deepEqual(validateTrainingRequestInput({course:'VARIA',varia:'Bijscholing politie'},options,null),
    {courseName:'Bijscholing politie',isVaria:true,note:''});
});
