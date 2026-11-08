import test from 'node:test';
import assert from 'node:assert/strict';
import {activeLeaveCollision,planLeaveExtension} from '../src/leave-extension-policy.js';
import {mayApproveLeave,leaveDecisionDays} from '../src/leave-policy.js';
import {readFileSync} from 'node:fs';

const applicant='222222222222222222';
const original={personDiscordId:applicant,status:'approved',
  startDate:'2026-11-01',endDate:'2026-11-21'};
const reviewer=role=>({discordId:'111111111111111111',role,departments:['politie'],
  departmentRoles:{politie:role}});
const pending=plan=>({personDiscordId:applicant,status:'pending',
  subjectDepartments:['politie'],subjectDepartmentRoles:{politie:'basiskader'},
  extensionOf:'originalLeaveRequest0001',...plan});

test('aansluitende en overlappende nieuwe aanvragen kunnen geen automatische verlenging worden',()=>{
  assert.equal(activeLeaveCollision([original],{startDate:'2026-11-22',endDate:'2026-11-25'}),true);
  assert.equal(activeLeaveCollision([original],{startDate:'2026-11-20',endDate:'2026-11-25'}),true);
  assert.equal(activeLeaveCollision([original],{startDate:'2026-11-23',endDate:'2026-11-29'}),false);
  assert.equal(activeLeaveCollision([{...original,status:'withdrawn'}],
    {startDate:'2026-11-22',endDate:'2026-11-28'}),false);
  assert.equal(activeLeaveCollision([{...original,status:'pending'}],
    {startDate:'2026-11-22',endDate:'2026-11-28'}),true);
});
test('21 plus 14 dagen wordt 35 dagen: geen Middenkader, wel Officieren en Korpsleiding',()=>{
  const plan=planLeaveExtension(original,'2026-12-05',[original],'2026-11-08');
  assert.deepEqual(plan,{startDate:'2026-11-22',endDate:'2026-12-05',days:14,
    periodStartDate:'2026-11-01',totalPeriodDays:35});
  const request=pending(plan);
  assert.equal(leaveDecisionDays(request),35);
  assert.equal(mayApproveLeave(reviewer('middenkader'),request,null,'2026-11-08'),false);
  assert.equal(mayApproveLeave(reviewer('officierenkader'),request,null,'2026-11-08'),true);
  assert.equal(mayApproveLeave(reviewer('korpsleiding'),request,null,'2026-11-08'),true);
});
test('totale duur maximaal 30 dagen mag Middenkader beoordelen, nooit eigen aanvraag',()=>{
  const plan=planLeaveExtension(original,'2026-11-30',[original],'2026-11-08');
  const request=pending(plan);
  assert.equal(leaveDecisionDays(request),30);
  assert.equal(mayApproveLeave(reviewer('middenkader'),request,null,'2026-11-08'),true);
  assert.equal(mayApproveLeave({...reviewer('middenkader'),discordId:applicant},
    request,null,'2026-11-08'),false);
  assert.equal(mayApproveLeave(reviewer('officierenkader'),request,null,'2026-11-08'),true);
  assert.equal(leaveDecisionDays({...request,totalPeriodDays:9}),null);
});
test('een tweede verlenging telt de volledige goedgekeurde keten mee',()=>{
  const first={...original,endDate:'2026-11-14'};
  const second={...original,startDate:'2026-11-15',endDate:'2026-11-25'};
  const plan=planLeaveExtension(first,'2026-12-01',[first,second],'2026-11-08');
  assert.equal(plan.startDate,'2026-11-26');
  assert.equal(plan.periodStartDate,'2026-11-01');
  assert.equal(plan.totalPeriodDays,31);
});
test('lopende uitbreiding, oude einddatum en verlopen verlof worden geweigerd',()=>{
  assert.throws(()=>planLeaveExtension(original,'2026-11-25',
    [original,{status:'pending',startDate:'2026-11-22',endDate:'2026-11-27'}],
    '2026-11-08'),/loopt/);
  assert.throws(()=>planLeaveExtension(original,'2026-11-22',[original],
    '2026-11-24'),/verstreken/);
  assert.throws(()=>planLeaveExtension(original,'2026-11-21',[original],
    '2026-11-08'),/nieuwe einddatum/);
  assert.throws(()=>planLeaveExtension(original,'2029-01-01',[original],
    '2026-11-08'),/730/);
});
test('endpoint, meldingen, origineel dossier en weekrapport vallen onder hetzelfde beleid',()=>{
  const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const routes=file('src/leave-routes.js'),page=file('public/verlofbeheer.html');
  const notifications=file('public/meldingen.html'),events=file('src/leave-event-log.js');
  assert.match(routes,/activeLeaveCollision\(timeline\.docs/);
  assert.match(routes,/app\.post\('\/api\/leave\/requests\/:id\/extend',requireUser,requireWrites/);
  assert.match(routes,/planLeaveExtension\(base\.data\(\),d\.endDate/);
  assert.match(routes,/status:'pending',autoApproved:false/);
  assert.match(events,/extension_submitted:'Verlofverlenging aangevraagd'/);
  assert.match(events,/tx\.create\(notice/);
  assert.match(page,/Verlenging aanvragen/);
  assert.match(notifications,/Number\(x\.totalPeriodDays\)/);
});
