import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {recoveryStatus,recoverySampleProjection,appendRecoveryApiSample,
 RECOVERY_GOAL_MINUTES,RECOVERY_WINDOW_DAYS,RECOVERY_SAMPLES_COLLECTION}
 from '../src/activity-recovery-policy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sample=(observedAt,totalPlayMinutes)=>({observedAt,totalPlayMinutes,
 lastConnectionAt:observedAt});
test('5 hours remains visible across November/December boundary but never authorizes status change',()=>{
 const now=new Date('2026-12-02T14:00:00Z');
 const source={trackingStatus:'50/50',samples:[
  sample('2026-11-29T09:00:00Z',1000),
  sample('2026-12-02T13:00:00Z',1300)
 ]};
 const x=recoverySampleProjection(source,'50/50',now);
 assert.equal(RECOVERY_GOAL_MINUTES,300);
 assert.equal(RECOVERY_WINDOW_DAYS,14);
 assert.equal(x.observedIncreaseMinutes,300);
 assert.equal(x.status,'api_threshold_observed');
 assert.equal(x.eligibleForActiveProposal,false);
 assert.equal(x.confirmedPlayMinutes,null);
 assert.equal(x.officialStatusChanged,false);
 assert.equal(x.monthBoundaryResets,false);
 assert.equal(x.sampleCount,2);
});
test('first observation does not misrepresent cumulative minutes as recovered hours',()=>{
 const now=new Date('2026-11-24T12:00:00Z');
 const noState=recoverySampleProjection(null,'INACTIEF',now);
 assert.equal(noState.status,'baseline_needed');
 assert.equal(noState.observedIncreaseMinutes,null);
 const base=recoverySampleProjection({trackingStatus:'INACTIEF',samples:[
  sample('2026-11-24T11:30:00Z',8000)
 ]},'INACTIEF',now);
 assert.equal(base.status,'baseline_captured');
 assert.equal(base.observedIncreaseMinutes,null);
 assert.equal(base.eligibleForActiveProposal,false);
});
test('14-day rolling window never prorates crossing snapshot intervals',()=>{
 const now=new Date('2026-12-01T10:00:00Z');
 const result=recoverySampleProjection({trackingStatus:'CHECKING',samples:[
  sample('2026-11-15T09:00:00Z',1000),
  sample('2026-11-16T10:00:00Z',1200),
  sample('2026-11-20T10:00:00Z',1300),
  sample('2026-11-30T10:00:00Z',1450)
 ]},'CHECKING',now);
 // The 200 minutes across 15->16 November must not be allocated into
 // the 17 November onwards window; only 20->30 interval can be counted.
 assert.equal(result.observedIncreaseMinutes,150);
 assert.equal(result.sampleCount,2);
 assert.equal(result.status,'sampling');
});
test('counter drops are excluded rather than falsely treated as negative or interpolated',()=>{
 const now=new Date('2026-11-24T12:00:00Z');
 const x=recoverySampleProjection({trackingStatus:'50/50',samples:[
  sample('2026-11-21T12:00:00Z',800),
  sample('2026-11-22T12:00:00Z',120),
  sample('2026-11-23T12:00:00Z',180)
 ]},'50/50',now);
 assert.equal(x.observedIncreaseMinutes,60);
 assert.equal(x.counterResetObserved,true);
 assert.equal(x.eligibleForActiveProposal,false);
});
test('stale samples and unrelated status never silently approve ACTIEF',()=>{
 const now=new Date('2026-11-24T12:00:00Z');
 const record={trackingStatus:'50/50',samples:[
  sample('2026-11-18T10:00:00Z',10),
  sample('2026-11-20T10:00:00Z',600)
 ]};
 assert.equal(recoverySampleProjection(record,'50/50',now).status,'stale');
 assert.equal(recoverySampleProjection(record,'INACTIEF',now).status,'baseline_needed');
 assert.equal(recoverySampleProjection(record,null,now).status,'not_applicable');
});
test('append requires explicit API sample and limits duplicate requests; source reset restarts safely',()=>{
 const now=new Date('2026-11-24T12:00:00Z');
 const first=appendRecoveryApiSample(null,'50/50',sample(now.toISOString(),650),now);
 assert.equal(first.changed,true);assert.equal(first.samples.length,1);
 const duplicate=appendRecoveryApiSample(first,'50/50',
  sample('2026-11-24T12:01:00Z',700),new Date('2026-11-24T12:01:00Z'));
 assert.equal(duplicate.changed,false);assert.equal(duplicate.samples.length,1);
 const later=appendRecoveryApiSample(first,'50/50',
  sample('2026-11-24T12:30:00Z',740),new Date('2026-11-24T12:30:00Z'));
 assert.equal(later.samples.length,2);
 assert.equal(recoverySampleProjection(later,'50/50',new Date('2026-11-24T12:31:00Z'))
  .observedIncreaseMinutes,90);
 const changed=appendRecoveryApiSample(later,'INACTIEF',
  sample('2026-11-24T12:35:00Z',760),new Date('2026-11-24T12:35:00Z'));
 assert.equal(changed.samples.length,1);
 assert.throws(()=>appendRecoveryApiSample(null,'ACTIEF',sample(now.toISOString(),50),now));
 assert.throws(()=>appendRecoveryApiSample(null,'50/50',{observedAt:now.toISOString(),totalPlayMinutes:-1},now));
});
test('server scopes API and cannot mutate personnel data; frontend uses explicit evidence action',()=>{
 const routes=read('src/activity-recovery-routes.js');
 const server=read('src/server.js');
 const ui=read('public/activity-dashboard.js');
 const page=read('public/activiteitscentrum.html');
 const css=read('public/activity-dashboard.css');
 assert.equal(RECOVERY_SAMPLES_COLLECTION,'bpd_fivem_recovery_api_samples');
 assert.match(routes,/canViewPersonnel\(req\.bpd,dept\)/);
 assert.match(routes,/canReadPersonnelSubject\(req\.bpd,found\[0\]\)/);
 assert.match(routes,/app\.post\('\/api\/activity-recovery\/:dept\/:discordId\/observe'/);
 assert.match(routes,/tx\.set\(document/);
 assert.doesNotMatch(routes,/bpd_cases|PERSONNEL_EDITS_COLLECTION|discord\.com|sendMessage|autoPing/);
 assert.match(server,/installActivityRecoveryRoutes\(app,\{requireUser:requireDossierUser,getSnapshot\}\)/);
 assert.match(ui,/id='activityFiveHourRecoveryPolicy'/);
 assert.match(ui,/Hersteluren controleren/);
 assert.match(ui,/eligibleForActiveProposal/);
 assert.match(page,/observeRecoveryProgress\(p\)/);
 assert.match(page,/renderActivityDashboard\(scoped,sources/);
 assert.match(css,/activity-recovery-evidence/);
 const inline=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 const check=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:inline,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
