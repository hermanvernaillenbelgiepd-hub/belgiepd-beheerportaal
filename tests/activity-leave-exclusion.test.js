import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {absenceBreakdown,absenceStage} from '../src/activity-absence-policy.js';
import {assessActivityPings} from '../src/activity-ping-policy.js';
test('50 calendar days, 25 approved leave days, only 25 effective inactivity days',()=>{
 const approved=[{status:'approved',startDate:'2026-10-20',endDate:'2026-11-13'}];
 assert.deepEqual(absenceBreakdown('2026-10-04',approved,'2026-11-23'),
  {calendarDays:50,excludedLeaveDays:25,effectiveDays:25});
});
test('overlapping leave periods cannot double count, pending periods do not exempt',()=>{
 const approved=[
  {status:'approved',startDate:'2026-11-02',endDate:'2026-11-10'},
  {status:'approved',startDate:'2026-11-08',endDate:'2026-11-15'},
  {status:'pending',startDate:'2026-11-16',endDate:'2026-11-20'}
 ];
 assert.deepEqual(absenceBreakdown('2026-11-01',approved,'2026-11-21'),
  {calendarDays:20,excludedLeaveDays:14,effectiveDays:6});
 assert.equal(absenceStage(14),'approaching-15');
 assert.equal(absenceStage(15),'approaching-30');
 assert.equal(absenceStage(30),'approaching-60');
 assert.equal(absenceStage(60),'review-60');
});
test('verified ping decisions never use calendar days without leave subtraction',()=>{
 const now=new Date('2026-11-23T12:00:00Z');
 const evidence={observedAt:'2026-11-23T11:00:00Z',
  closedMonth:'2026-10',closedMonthPlaySeconds:20*3600,
  lastConnectedAt:'2026-10-04T10:00:00Z'};
 const approved=[{status:'approved',startDate:'2026-10-20',endDate:'2026-11-13'}];
 const actual=assessActivityPings(evidence,{joinedAt:'2026-09-01T00:00:00Z',leaves:approved},now);
 assert.equal(actual[0].kind,'50/50');
 assert.deepEqual([actual[0].evidence.calendarDays,actual[0].evidence.excludedLeaveDays,
  actual[0].evidence.days],[50,25,25]);
});
test('portal-only notification can never attest Discord delivery',()=>{
 const source=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 assert.match(source,/portalNotice=req\.body\?\.portalNotice===true/);
 assert.match(source,/data\.discordPingSent!==false/);
 assert.match(source,/discordContactSource:portalNotice\?'portal_only':'manual_attestation'/);
});
