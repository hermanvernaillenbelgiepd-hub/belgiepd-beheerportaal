import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAdministerDcTransfer} from '../src/dc-id-transfer-policy.js';
import {mayReviewTrainingRequest} from '../src/training-request-policy.js';
import {roleForDepartment} from '../src/leave-policy.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='1398985105254650007',target='1309532438019706966';
const policeOfficer={uid:'discord:'+id,discordId:id,discordRosterEditorVerified:true,
 role:'officierenkader',departments:['politie'],departmentRoles:{politie:'officierenkader'}};
test('Herinstroommeldingen zijn enkel voor gecontroleerd politiehoger kader of technische modus',()=>{
 assert.equal(mayAdministerDcTransfer(policeOfficer),true);
 assert.equal(mayAdministerDcTransfer({...policeOfficer,role:'middenkader',
  departmentRoles:{politie:'middenkader'}}),false);
 assert.equal(mayAdministerDcTransfer({...policeOfficer,discordRosterEditorVerified:false}),false);
 assert.equal(mayAdministerDcTransfer({...policeOfficer,departments:['ambulance'],
  departmentRoles:{ambulance:'officierenkader'}}),false);
});
test('Protected archived dossier hints also respect subject permission',()=>{
 const source=file('src/personnel-return-review-routes.js');
 assert.match(source,/if\(!mayAdministerDcTransfer\(req\.bpd\)\)/);
 assert.match(source,/const readable=possible\.filter\(p=>canReadPersonnelSubject\(req\.bpd,p\)\)/);
 assert.match(source,/const oldReadable=oldSame&&canReadPersonnelSubject\(req\.bpd,oldSame\)/);
 assert.match(source,/archivedSameId:Boolean\(oldReadable\)/);
 assert.match(source,/possiblePriorRecord:readable\.length>0/);
 assert.doesNotMatch(source,/archivedSameId:Boolean\(oldSame\)/);
 assert.doesNotMatch(source,/possiblePriorRecord:possible\.length>0/);
});
test('Meldingen persoonlijke en kadergegevens lopen via eigen geverifieerde endpoints',()=>{
 const management=file('src/management-routes.js');
 const leave=file('src/leave-routes.js');
 const school=file('src/training-request-routes.js');
 const page=file('public/meldingen.html');
 assert.match(management,/app\.get\('\/api\/management\/pings\/mine',requireMemberUser/);
 assert.match(management,/staffActivityFollowup\(req\.bpd,snapshot\.data\)/);
 assert.match(leave,/app\.get\('\/api\/leave\/requests',requireUser/);
 assert.match(leave,/mayApproveLeave\(\s*req\.bpd/);
 assert.match(leave,/assigned\.includes\(personSeries\(subject\)\)/);
 assert.match(school,/if\(reviewScope\(ctx,request\)\)incoming\.push/);
 assert.match(page,/result\.mine\|\|\[\]/);
 assert.match(page,/result\.toReview\|\|\[\]/);
});
test('Rang- en dienstscope blijven gelden voor opleidingsmeldingen',()=>{
 const actor={discordId:id,role:'middenkader',departments:['politie'],
  departmentRoles:{politie:'middenkader'}};
 assert.equal(roleForDepartment(actor,'politie'),'middenkader');
 assert.equal(roleForDepartment(actor,'brandweer'),null);
 assert.equal(mayReviewTrainingRequest(actor,{department:'politie',
  applicantDiscordId:target,applicantTier:'basiskader'}),true);
 assert.equal(mayReviewTrainingRequest(actor,{department:'politie',
  applicantDiscordId:target,applicantTier:'middenkader'}),false);
 assert.equal(mayReviewTrainingRequest(actor,{department:'brandweer',
  applicantDiscordId:target,applicantTier:'basiskader'}),false);
});
