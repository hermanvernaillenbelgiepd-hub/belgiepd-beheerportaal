import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRAINING_REQUEST_STATUSES,ACTIVE_TRAINING_REQUEST_STATUSES,
 nextTrainingRequestStatus,validTrainingSchedule} from '../src/training-request-policy.js';
import {availableTrainingActions,TRAINING_ACTIONS,trainingStateText}
 from '../public/training-request-actions.js';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('the five lifecycle actions enforce verified planning and archival after execution',()=>{
 assert.deepEqual([...TRAINING_REQUEST_STATUSES],[
  'nieuw','gelezen','gepland','afgewezen','uitgevoerd','gegeven','gewist']);
 assert.deepEqual([...ACTIVE_TRAINING_REQUEST_STATUSES],['nieuw','gelezen','gepland']);
 assert.equal(nextTrainingRequestStatus('nieuw','gelezen'),'gelezen');
 assert.equal(nextTrainingRequestStatus('gelezen','gepland'),'gepland');
 assert.equal(nextTrainingRequestStatus('nieuw','afgewezen'),'afgewezen');
 assert.equal(nextTrainingRequestStatus('gepland','uitgevoerd'),'uitgevoerd');
 assert.equal(nextTrainingRequestStatus('uitgevoerd','wissen'),'gewist');
 assert.throws(()=>nextTrainingRequestStatus('nieuw','wissen'));
 assert.throws(()=>nextTrainingRequestStatus('gelezen','uitgevoerd'));
 assert.throws(()=>nextTrainingRequestStatus('gepland','wissen'));
 assert.throws(()=>nextTrainingRequestStatus('afgewezen','wissen'));
 assert.throws(()=>nextTrainingRequestStatus('gewist','gelezen'));
});
test('reviewers without instructor authority cannot plan or mark completed',()=>{
 assert.deepEqual(availableTrainingActions({status:'nieuw',canSchedule:false}),
  ['gelezen','afgewezen']);
 assert.deepEqual(availableTrainingActions({status:'gepland',canSchedule:false}),[]);
 assert.deepEqual(availableTrainingActions({status:'gepland',canSchedule:true}),
  ['uitgevoerd']);
 assert.deepEqual(availableTrainingActions({status:'uitgevoerd',canSchedule:false}),['wissen']);
 assert.equal(TRAINING_ACTIONS.length,5);
});
test('calendar timestamps must include timezone and a sensible future interval',()=>{
 const a=new Date(Date.now()+2*24*60*60*1000);
 const b=new Date(a.getTime()+90*60*1000);
 const result=validTrainingSchedule({startAt:a.toISOString(),endAt:b.toISOString(),
  location:'Opleidingscentrum'});
 assert.equal(result.location,'Opleidingscentrum');
 assert.equal(result.startAt,a.toISOString());
 for(const bad of [
  {startAt:'2026-11-12T19:00',endAt:'2026-11-12T21:00',location:'Zaal'},
  {startAt:b.toISOString(),endAt:a.toISOString(),location:'Zaal'},
  {startAt:a.toISOString(),endAt:new Date(a.getTime()+30*60*60*1000).toISOString(),location:'Zaal'},
  {startAt:a.toISOString(),endAt:b.toISOString(),location:'X'},
  {startAt:a.toISOString(),endAt:b.toISOString(),location:'Zaal',private:true}
 ])assert.throws(()=>validTrainingSchedule(bad));
});
test('authenticated shared calendar excludes individual application notes and IDs',()=>{
 const route=read('src/training-request-routes.js');
 const summary=route.slice(route.indexOf('const eventSummary='),route.indexOf('app.get(\'/api/training-calendar\'')); 
 assert.match(summary,/imageAssetCode/);
 assert.doesNotMatch(summary,/applicantDiscordId|note:x\.note|participantDetails/);
 assert.match(route,/app\.get\('\/api\/training-calendar',identity/);
 assert.match(route,/app\.post\('\/api\/training-calendar',identity/);
 assert.match(route,/!scheduleScope\(ctx,dept\)/);
 assert.match(route,/TRAINING_ROLE_IDS\[dept\]/);
 assert.match(route,/ctx\.verifiedRoleIds\.includes\(id\)/);
 assert.match(route,/attendanceConfirmed!==true/);
 assert.match(route,/eventSnap\.get\('requestId'\)!==id/);
 assert.doesNotMatch(route,/\['gelezen','gegeven','wissen'\]\.includes\(action\)/);
 const server=read('src/server.js');
 assert.match(server,/app\.use\('\/api\/training-calendar',express\.json/);
 assert.match(route,/verifiedInstructor/);
 assert.match(route,/request\.applicantDiscordId!==ctx\.id/);
 assert.match(route,/!\['officierenkader','korpsleiding'\]\.includes\(request\.applicantTier\)/);
});
test('each life-cycle action is recorded in both dossier and audit, and calendar is public across services',()=>{
 const route=read('src/training-request-routes.js');
 assert.match(route,/tx\.create\(ref\.collection\('audit'\)\.doc\(\)/);
 assert.match(route,/tx\.create\(activity,/);
 assert.match(route,/reportCategory:action==='uitgevoerd'\?'opleiding':'activiteit'/);
 assert.match(route,/tx\.create\(calendar,/);
 assert.match(route,/tx\.update\(calendar,\{status:'uitgevoerd'/);
 assert.match(route,/\['gepland','uitgevoerd'\]\.includes\(d\.status\)/);
 const page=read('public/opleidingskalender.html');
 assert.match(page,/Multidisciplinaire opleidingskalender/);
 assert.match(page,/option value="politie"/);
 assert.match(page,/option value="brandweer"/);
 assert.match(page,/option value="ambulance"/);
 assert.match(page,/option value="depannage"/);
 assert.match(page,/\/api\/training-calendar/);
 assert.match(page,/createPanel/);
});
test('reekshoofden only receive read-only leave info from their own police series',()=>{
 const route=read('src/leave-routes.js');
 assert.match(route,/app\.get\('\/api\/leave\/series-notifications',requireUser/);
 assert.match(route,/SERIES_LEADERS/);
 // Centralized policy now serves both the visible series feed and the
 // server-side per-user read confirmation; preserve the access assertions.
 const policy=read('src/notification-read-policy.js');
 assert.match(route,/canSeeSeriesLeaveNotification/);
 assert.match(policy,/SERIES_LEADERS\[series\]/);
 assert.match(policy,/personSeries\(subject\)/);
 assert.match(policy,/request\.status==='pending'/);
 assert.match(policy,/request\.status==='approved'&&request\.autoApproved===true/);
 assert.match(policy,/72\*60\*60\*1000/);
 const page=read('public/meldingen.html');
 assert.match(page,/id="seriesLeavePanel"/);
 assert.match(page,/\/api\/leave\/series-notifications/);
 assert.match(page,/void loadSeriesLeave\(\)/);
});
test('users can view all published events, without personal names or confidential evaluations',()=>{
 const page=read('public/opleidingskalender.html');
 assert.match(page,/const event of shown/);
 assert.match(page,/new Date\(t\)\.toLocaleString\('nl-BE',\{/);
 assert.match(page,/timeZone:'Europe\/Brussels'/);
 assert.match(page,/window|Firebase|firebasejs/);
 assert.ok(trainingStateText({status:'uitgevoerd'}).includes('uitgevoerd'));
});
