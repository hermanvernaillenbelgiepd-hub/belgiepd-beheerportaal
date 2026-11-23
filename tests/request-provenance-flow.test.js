import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leaveRequestWorkflow} from '../src/leave-request-provenance.js';
const id='111111111111111111',writer='222222222222222222',reviewer='333333333333333333';
test('self-application, auto approval and manual on-behalf registration keep different actors',()=>{
 const normal=leaveRequestWorkflow({personDiscordId:id,subjectName:'Voorbeeld',subjectCall:'350',
  submittedByDiscordId:id,status:'approved',decidedBy:'system',autoApproved:true});
 assert.equal(normal.submittedBy.name,'Voorbeeld');
 assert.equal(normal.decidedBy.name,'Systeem · automatische goedkeuring');
 const manual=leaveRequestWorkflow({manual:true,personDiscordId:id,subjectName:'Aanvrager',subjectCall:'340',
  submittedByDiscordId:writer,submittedByActor:{discordId:writer,name:'Invoerder',call:'680'},
  decidedByDiscordId:reviewer,decidedByActor:{discordId:reviewer,name:'Beslisser',call:'930'},
  decisionNote:'Tijdelijke afwijzing'});
 assert.equal(manual.submittedOnBehalf,true);
 assert.equal(manual.submittedBy.name,'Invoerder');
 assert.equal(manual.decidedBy.name,'Beslisser');
 assert.equal(manual.decisionNote,'Tijdelijke afwijzing');
 assert.equal(manual.applicant.name,'Aanvrager');
});
test('historic migrated actor remains distinct from original applicant and portal importer',()=>{
 const info=leaveRequestWorkflow({manual:true,historicalImport:true,personDiscordId:id,
  submittedByDiscordId:writer,registeredBy:{discordId:reviewer,name:'Historische auteur',call:'700'},
  submittedByActor:{discordId:writer,name:'Importer',call:'930'}});
 assert.equal(info.originalRecorder.name,'Historische auteur');
 assert.equal(info.submittedBy.name,'Importer');
});
test('decision actor identity is saved in the same protected request and weekrapport audit',()=>{
 const s=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
 assert.match(s,/decidedByActor:decisionActor/);
 assert.match(s,/decidedByActor:manualActor/);
 assert.match(s,/workflow:leaveRequestWorkflow\(d\)/);
 assert.match(s,/actor:decisionActor/);
 assert.match(s,/decisionNote:note\.trim\(\)/);
});
test('training rejection reason is optional without changing reviewer scope',()=>{
 const routes=readFileSync(new URL('../src/training-request-routes.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/training-request-actions.js',import.meta.url),'utf8');
 assert.match(routes,/if\(reason\.length>400\)/);
 assert.match(routes,/rejectionReason=reason/);
 assert.match(routes,/submittedByActor:actor/);
 assert.match(ui,/Reden van afwijzing \(optioneel/);
 assert.match(ui,/reason===null/);
});
