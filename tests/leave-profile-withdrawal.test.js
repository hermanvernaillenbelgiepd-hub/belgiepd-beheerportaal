import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leaveCanWithdraw,leaveCanReapply,leaveEventDetails,leaveEventLabel,writeLeaveEvent}
  from '../src/leave-event-log.js';

const request={personDiscordId:'111111111111111111',subjectName:'Demo',
  subjectCall:'S401',startDate:'2026-11-10',endDate:'2026-11-18',
  days:9,status:'approved',subjectDepartments:['politie','brandweer']};

test('Eigen toekomstige aanvragen kunnen ingetrokken worden; geweigerd en reeds ingetrokken niet',()=>{
  assert.equal(leaveCanWithdraw(request,'2026-10-23'),true);
  assert.equal(leaveCanWithdraw({...request,status:'pending'},'2026-10-23'),true);
  assert.equal(leaveCanWithdraw({...request,status:'withdrawn'},'2026-10-23'),false);
  assert.equal(leaveCanWithdraw({...request,status:'rejected'},'2026-10-23'),false);
  assert.equal(leaveCanWithdraw({...request,endDate:'2026-10-22'},'2026-10-23'),false);
});

test('Indiening, goedkeuring, afwijzing en intrekking blijven apart benoemde gebeurtenissen',()=>{
  for(const action of ['submitted','automatic_approved','approved','rejected','withdrawn',
    'manual_approved','korpsleiding_vrijgesteld','board_override']){
    assert.notEqual(leaveEventLabel(action),'Verlofwijziging');
  }
  assert.match(leaveEventDetails('withdrawn',request,'approved','withdrawn'),/goedgekeurd|approved/i);
  assert.match(leaveEventDetails('withdrawn',request,'approved','withdrawn'),/withdrawn/);
});

test('Iedere statusovergang schrijft een immutable audit en weekrapport dossierevent',()=>{
  const source=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
  const helper=readFileSync(new URL('../src/leave-event-log.js',import.meta.url),'utf8');
  assert.match(source,/app\.post\('\/api\/leave\/requests\/:id\/withdraw'/);
  assert.match(source,/prior\.personDiscordId!==req\.bpd\.discordId/);
  assert.match(source,/tx\.update\(ref,\{status:'withdrawn'/);
  assert.match(source,/writeLeaveEvent\(tx,\{requestRef:ref,request:prior,action:'withdrawn'/);
  assert.match(source,/writeLeaveEvent\(tx,\{requestRef:target,request:historyBase,action:'submitted'/);
  assert.match(source,/action:decision/);
  assert.match(source,/action:'board_override'/);
  assert.match(helper,/tx\.create\(requestRef\.collection\('audit'\)/);
  assert.match(helper,/tx\.create\(ref,\{/);
  assert.match(helper,/type:'verlof'/);
  assert.match(helper,/tx\.create\(notice/);
  assert.match(helper,/eventDate,/);
  assert.match(helper,/new Set/);
});

test('Profiel toont intrekking en ladende historie enkel op verzoek',()=>{
  const page=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
  assert.match(page,/Verlof intrekken/);
  assert.match(page,/Ingetrokken/);
  assert.match(page,/\/api\/leave\/requests\/.*?\/withdraw/);
  assert.match(page,/history\.addEventListener\('toggle'/);
  assert.match(page,/Gevolgde opleidingen/);
  assert.match(page,/class="profile-fold"/);
  assert.match(page,/renderAdvancedRoles\(\)/);
});

test('Na intrekking of weigering opnieuw dezelfde verlofperiode aanvragen',()=>{
  for(const status of ['withdrawn','rejected'])
    assert.equal(leaveCanReapply(status),true,status);
  for(const status of ['pending','approved',undefined,null,'unknown'])
    assert.equal(leaveCanReapply(status),false,String(status));
  const source=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
  // Het oorspronkelijke document blijft intact; een nieuwe aanvraag heeft
  // een eigen ID en de ankerpointer voorkomt parallelle actieve duplicaten.
  assert.match(source,/const target=original\.exists\?db\(\)\.collection\(coll\)\.doc\(\):ref/);
  assert.match(source,/tx\.update\(ref,\{\s*latestAttemptId:target\.id/);
  assert.match(source,/tx\.create\(target,\{/);
  assert.match(source,/previousAttemptId:latest\.id/);
  assert.match(source,/latest=await tx\.get\(db\(\)\.collection\(coll\)\.doc\(latestId\)\)/);
  assert.match(source,/\['pending','approved'\]\.includes\(latest\.get\('status'\)\)/);
  assert.match(source,/!leaveCanReapply\(latest\.get\('status'\)\)/);
  assert.match(source,/writeLeaveEvent\(tx,\{requestRef:target/);
  assert.match(source,/return res\.status\(201\)\.json\(\{id:createdId/);
});
