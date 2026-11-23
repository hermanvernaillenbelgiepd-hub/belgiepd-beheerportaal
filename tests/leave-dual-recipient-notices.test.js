import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leaveDecisionRecipients,validPersonalLeaveDecisionId,stageLeaveDecisionNotifications}
 from '../src/leave-decision-notifications.js';
const applicant='111111111111111111',writer='222222222222222222';
const requestId='manual_central_'+applicant+'_2026-10-28_2026-12-31';
const request={personDiscordId:applicant,submittedByDiscordId:writer,manual:true,
 subjectName:'Gin',subjectCall:'345',startDate:'2026-10-28',endDate:'2026-12-31',
 submittedByActor:{discordId:writer,call:'620',name:'Unemi'}};
test('both applicant and manual submitting cadre are separate personal recipients',()=>{
 assert.deepEqual(leaveDecisionRecipients(request),[
  {recipientDiscordId:applicant,recipientRole:'aanvrager'},
  {recipientDiscordId:writer,recipientRole:'handmatige_indiener'}
 ]);
 assert.deepEqual(leaveDecisionRecipients({...request,submittedByDiscordId:applicant}),
  [{recipientDiscordId:applicant,recipientRole:'aanvrager'}]);
 assert.deepEqual(leaveDecisionRecipients({...request,manual:false}),
  [{recipientDiscordId:applicant,recipientRole:'aanvrager'}]);
 assert.deepEqual(leaveDecisionRecipients({...request,submittedByDiscordId:'invalid'}),
  [{recipientDiscordId:applicant,recipientRole:'aanvrager'}]);
});
test('two notices use same canonical request, exact decision and optional reason',()=>{
 const created=[];
 const mockDB={collection:collection=>({doc:id=>{
  assert.equal(collection,'bpd_personal_leave_decisions');
  return {id};
 }})};
 const tx={create:(doc,payload)=>created.push({id:doc.id,payload})};
 const count=stageLeaveDecisionNotifications(tx,{db:mockDB,
  requestRef:{id:requestId},request,decision:'rejected',
  decidedBy:{discordId:'333333333333333333',call:'930',name:'Commissaris'},
  note:'Reeds te veel collega’s in verlof',eventKey:'decision'});
 assert.equal(count,2);
 assert.equal(created.length,2);
 assert.ok(created.every(x=>x.payload.requestId===requestId));
 assert.ok(created.every(x=>x.payload.decision==='rejected'));
 assert.ok(created.every(x=>x.payload.decisionReason==='Reeds te veel collega’s in verlof'));
 assert.ok(created.every(x=>x.payload.decidedBy.call==='930'));
 assert.deepEqual(created.map(x=>x.payload.recipientDiscordId),[applicant,writer]);
 assert.ok(created.every(x=>validPersonalLeaveDecisionId(x.id)));
});
test('same submitter/applicant gets one notice; historical fake identities rejected',()=>{
 const created=[];
 const db={collection:()=>({doc:id=>({id})})};
 stageLeaveDecisionNotifications({create:(doc)=>created.push(doc.id)},{
  db,requestRef:{id:requestId},request:{...request,submittedByDiscordId:applicant},
  decision:'approved',eventKey:'decision'});
 assert.equal(created.length,1);
 assert.equal(validPersonalLeaveDecisionId('wrong_abc_decision'),false);
 assert.equal(validPersonalLeaveDecisionId(writer+'_short_decision'),false);
});
test('all decisions stage two receipts in the same authorized transaction as the dossier audit',()=>{
 const routes=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
 assert.match(routes,/app\.get\('\/api\/leave\/decision-notifications',requireUser/);
 assert.match(routes,/app\.post\('\/api\/leave\/decision-notifications\/:id\/read',requireUser/);
 assert.match(routes,/snap\.get\('recipientDiscordId'\)!==recipient/);
 assert.match(routes,/stageLeaveDecisionNotifications\(tx,\{db:db\(\),requestRef:ref,request:d/);
 assert.match(routes,/stageLeaveDecisionNotifications\(tx,\{db:db\(\),requestRef:ref,request:previous/);
 assert.match(routes,/!needsHigherApproval&&!originalAuthor/);
 assert.match(routes,/eventKey:'auto_approved'/);
});
