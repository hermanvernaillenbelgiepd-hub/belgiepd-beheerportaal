import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canSubmitTrainingRequest,mayReviewTrainingRequest,policeRequestTier} from '../src/training-request-policy.js';

const police=(call,rank)=>({dept:'politie',call,rank});
const officer=police('920','Aspirant Commissaris');
const chief=police('900','Eerste Hoofdcommissaris');
const id='123456789012345678';
const actor=(role,discordId)=>({role,discordId,departments:['politie'],
 departmentRoles:{politie:role}});

test('officer requests go strictly to Korpsleiding, never another officer',()=>{
 const request={department:'politie',applicantTier:'officierenkader',
  applicantDiscordId:'999999999999999999'};
 assert.equal(policeRequestTier(officer),'officierenkader');
 assert.equal(canSubmitTrainingRequest(officer,'officierenkader',null,true),true);
 assert.equal(mayReviewTrainingRequest(actor('officierenkader',id),request),false);
 assert.equal(mayReviewTrainingRequest(actor('korpsleiding',id),request),true);
 assert.equal(mayReviewTrainingRequest(actor('korpsleiding',request.applicantDiscordId),request),false);
});
test('Korpsleiding cannot submit new self-requests even with own verified roster profile',()=>{
 assert.equal(policeRequestTier(chief),'korpsleiding');
 assert.equal(canSubmitTrainingRequest(chief,'korpsleiding','korpsleiding',true),false);
 assert.equal(canSubmitTrainingRequest(chief,'korpsleiding',null,true),false);
 assert.equal(canSubmitTrainingRequest(chief,'korpsleiding','korpsleiding',false),false);
 const old={department:'politie',applicantTier:'korpsleiding',
  applicantDiscordId:'999999999999999999'};
 assert.equal(mayReviewTrainingRequest(actor('officierenkader',id),old),false);
 assert.equal(mayReviewTrainingRequest(actor('korpsleiding',id),old),true);
});
test('regular police cadre still keep previously approved routing',()=>{
 const request={department:'politie',applicantTier:'basiskader',
  applicantDiscordId:'999999999999999999'};
 assert.equal(mayReviewTrainingRequest(actor('officierenkader',id),request),true);
 assert.equal(mayReviewTrainingRequest(actor('korpsleiding',id),request),true);
});
test('live nameplate and grade share coat transform and factory slots match editor',()=>{
 const formal=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 assert.match(formal,/stage\.style\.transform='translate\(-50%,-50%\) '\+move/);
 assert.match(formal,/snapAssignedPortraitPlates\(img,person,plate,chest\)/);
 assert.match(formal,/snapAssignedPortraitPlates\(image,person,nameplate,patch\)/);
 assert.match(formal,/factoryChestPlacement/);
 for(const value of ['27.2','34.7','15.8','55.3','15.6'])
  assert.ok(formal.includes(value)&&studio.includes(value),'Shared coordinate '+value);
 assert.match(css,/\.bpd-assigned-coat/);
 assert.match(css,/\.bpd-gold-nameplate>\.bpd-gold-name/);
 assert.match(css,/\.bpd-silver-grade-art/);
 assert.match(studio,/panel\.style\.aspectRatio=pic\.naturalWidth\+'\/'\+pic\.naturalHeight/);
 assert.match(admin,/id="composeSnapChest"/);
});
test('training form explains the absence of a higher grade than Korpsleiding',()=>{
 const page=readFileSync(new URL('../public/opleidingscentrum.html',import.meta.url),'utf8');
 assert.match(page,/Korpsleiding is de hoogste operationele graad/);
 assert.match(page,/uitsluitend bij de Korpsleiding/);
});
