import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayRegisterCentralManualLeave,maySubmitManualLeaveForApproval,
  mayApproveLeave} from '../src/leave-policy.js';

const officer='222222222222222222',subject='111111111111111111';
const actor=role=>({discordId:officer,role,departments:['politie'],
  departmentRoles:{politie:role}});
const pending={
  personDiscordId:subject,status:'pending',startDate:'2026-11-18',
  endDate:'2026-12-18',days:31,subjectDepartments:['politie'],
  subjectDepartmentRoles:{politie:'basiskader'},subjectRole:'basiskader'
};

test('31-daags manueel verlof van een basiskaderlid gaat van MK naar OK/KL',()=>{
  const mk=actor('middenkader');
  assert.equal(mayRegisterCentralManualLeave(mk,subject,31,'basiskader',true),false);
  assert.equal(maySubmitManualLeaveForApproval(mk,subject,31,'basiskader',true),true);
  assert.equal(maySubmitManualLeaveForApproval(mk,subject,30,'basiskader',true),false);
  assert.equal(maySubmitManualLeaveForApproval(mk,subject,31,'middenkader',true),false);
  assert.equal(maySubmitManualLeaveForApproval(mk,subject,31,null,true),false);
  assert.equal(maySubmitManualLeaveForApproval(mk,subject,31,'basiskader',false),false);
  assert.equal(maySubmitManualLeaveForApproval({...mk,discordId:subject},subject,31,'basiskader',true),false);
  assert.equal(maySubmitManualLeaveForApproval(actor('officierenkader'),subject,31,'basiskader',true),false);
  assert.equal(mayApproveLeave(mk,pending,null,'2026-11-18'),false);
  assert.equal(mayApproveLeave(actor('officierenkader'),pending,null,'2026-11-18'),true);
  assert.equal(mayApproveLeave(actor('korpsleiding'),pending,null,'2026-11-18'),true);
  assert.equal(mayApproveLeave({...actor('officierenkader'),discordId:subject},pending,null,'2026-11-18'),false);
});

test('Manuele aanvraag wordt gelogd en verschijnt als pending voor hogere leiding',()=>{
  const routes=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
  const events=readFileSync(new URL('../src/leave-event-log.js',import.meta.url),'utf8');
  assert.match(routes,/needsHigherApproval\?'pending':'approved'/);
  assert.match(routes,/manualPendingReview:needsHigherApproval/);
  assert.match(routes,/subjectDepartmentRoles/);
  assert.match(routes,/action:needsHigherApproval\?'manual_submitted':'manual_approved'/);
  assert.match(events,/manual_submitted:'Verlof namens medewerker ter goedkeuring ingediend'/);
});

test('Meldingsrubrieken zijn afzonderlijk inklapbaar en formulieren tonen 31-dagenmelding',()=>{
  const notifications=readFileSync(new URL('../public/meldingen.html',import.meta.url),'utf8');
  for(const fold of ['staffFollowupFold','activityPingsFold','personalLeaveFold',
    'seriesLeaveFold','reviewFold','overrideFold','trainingPersonalFold','trainingReviewFold']){
    assert.match(notifications,new RegExp('id="'+fold+'"'));
  }
  assert.match(notifications,/id="reviewFold" open/);
  assert.match(notifications,/id="reviewCount"/);
  const personnel=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  assert.match(personnel,/id="leaveManualGuidance"/);
  assert.match(personnel,/Middenkader dient ter goedkeuring in bij Officierenkader of Korpsleiding/);
  assert.match(personnel,/saved.status==='pending'/);
});
