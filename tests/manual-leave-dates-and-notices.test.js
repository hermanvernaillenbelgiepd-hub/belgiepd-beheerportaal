import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBelgianDateInput,formatBelgianDateInput} from '../public/bpd-date-inputs.js';
import {mayViewLongManualLeaveNotice,mayApproveLeave} from '../src/leave-policy.js';
const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const first='111111111111111111',second='222222222222222222';
const actor=(role='middenkader',dept='politie')=>({
 discordId:first,uid:'discord:'+first,role,departments:[dept],
 departmentRoles:{[dept]:role}});
const entry={personDiscordId:second,manual:true,manualPendingReview:true,
 status:'pending',startDate:'2026-11-18',endDate:'2026-12-18',days:31,
 subjectDepartments:['politie'],subjectDepartmentRoles:{politie:'basiskader'},
 subjectRole:'basiskader'};
test('Belgian manual date fields accept pasted day/month/year and reject impossible days',()=>{
 assert.equal(parseBelgianDateInput('19/11/2026'),'2026-11-19');
 assert.equal(parseBelgianDateInput('19-11-2026'),'2026-11-19');
 assert.equal(parseBelgianDateInput('19.11.2026'),'2026-11-19');
 assert.equal(parseBelgianDateInput('19112026'),'2026-11-19');
 assert.equal(parseBelgianDateInput('2026-11-19'),'2026-11-19');
 assert.equal(formatBelgianDateInput('2026-11-19'),'19/11/2026');
 for(const invalid of ['31/02/2026','32/01/2026','31/04/2026','2026-02-29',
  '19/13/2026','', 'een datum'])assert.equal(parseBelgianDateInput(invalid),'');
 const frontend=text('public/bpd-date-inputs.js');
 assert.ok(frontend.includes("native.value=iso"));
 assert.ok(frontend.includes("native.dispatchEvent(new Event('change'"));
});
test('31+ manual pending visible read-only to higher service cadre, cannot be approved by middle cadre',()=>{
 assert.equal(mayViewLongManualLeaveNotice(actor('middenkader'),entry),true);
 assert.equal(mayViewLongManualLeaveNotice(actor('officierenkader'),entry),true);
 assert.equal(mayViewLongManualLeaveNotice(actor('korpsleiding'),entry),true);
 assert.equal(mayApproveLeave(actor('middenkader'),entry,null,'2026-11-19'),false);
 assert.equal(mayApproveLeave(actor('officierenkader'),entry,null,'2026-11-19'),true);
 assert.equal(mayViewLongManualLeaveNotice(actor('middenkader'),
   {...entry,endDate:'2026-12-17',days:30}),false);
 assert.equal(mayViewLongManualLeaveNotice(actor('middenkader'),
   {...entry,status:'approved'}),false);
 assert.equal(mayViewLongManualLeaveNotice(actor('middenkader'),
   {...entry,manualPendingReview:false}),false);
 assert.equal(mayViewLongManualLeaveNotice({...actor(),discordId:second},entry),false);
 assert.equal(mayViewLongManualLeaveNotice(actor('basiskader'),entry),false);
 assert.equal(mayViewLongManualLeaveNotice(actor('middenkader','brandweer'),entry),false);
 assert.equal(mayViewLongManualLeaveNotice(actor('middenkader','brandweer'),
  {...entry,subjectDepartments:['brandweer'],subjectDepartmentRoles:{},subjectRole:'basiskader'}),false);
});
test('One pending leave request appears in dossier/weekrapport and information without another write',()=>{
 const routes=text('src/leave-routes.js');
 const staff=text('public/personeelsbeheer.html');
 const notifications=text('public/meldingen.html');
 assert.ok(routes.includes("action:needsHigherApproval?'manual_submitted':'manual_approved'"));
 assert.ok(routes.includes('toInformation:informational.map(d=>item(d,true))'));
 assert.ok(routes.includes('mayViewLongManualLeaveNotice(req.bpd,x.record)'));
 assert.ok(staff.includes('id="manualLeaveEscalationToast"'));
 assert.ok(staff.includes("showManualLeaveEscalation(days)"));
 assert.ok(notifications.includes('id="manualLongLeavePanel"'));
 assert.ok(notifications.includes('manualLeaveInformation(item)'));
 assert.ok(notifications.includes("const informative=result.toInformation||[]"));
 assert.ok(staff.includes('pending'));
 for(const [path,ids] of [
  ['public/personeelsbeheer.html',["'leaveFrom'","'leaveUntil'"]],
  ['public/verlofbeheer.html',["'start'","'end'"]],
  ['public/brandweerdossier.html',["'fireLeaveFrom'","'fireLeaveUntil'"]]
 ]){
  const html=text(path);
  assert.ok(html.includes("from '/bpd-date-inputs.js'"));
  for(const id of ids)assert.ok(html.includes(id));
 }
});
