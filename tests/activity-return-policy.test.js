import test from 'node:test';
import assert from 'node:assert/strict';
import {dueLeaveReturns,returnCheckId,returnCheckPublic,daysBefore}
 from '../src/activity-return-policy.js';
import {leaveInformation,dossierPingSummary,enrichActivityRow,activityCenterStatistics}
 from '../src/activity-center-details.js';

const id='123456789012345678',person=(dept='politie')=>({
 dept,personId:id,name:'Testpersoon',call:'600',status:'Actief',lifecycleState:'active'
});
const leave=(startDate,endDate,extra={})=>({
 personDiscordId:id,startDate,endDate,status:'approved',...extra
});
const today='2026-11-19';
test('only completed approved leave becomes CHECKING, in each actual service',()=>{
 const people=[person(),person('brandweer')];
 const found=dueLeaveReturns([leave('2026-11-01','2026-11-18')],people,today);
 assert.equal(found.length,2);
 assert.equal(found[0].id,returnCheckId('politie',id,'2026-11-18'));
 assert.equal(found[1].id,returnCheckId('brandweer',id,'2026-11-18'));
 assert.equal(found[0].endDate,'2026-11-18');
});
test('current approved leave and an approved extension suppress early CHECKING',()=>{
 const past=leave('2026-11-10','2026-11-18');
 const extension=leave('2026-11-19','2026-11-30');
 assert.deepEqual(dueLeaveReturns([past,extension],[person()],today),[]);
});
test('historical imports, pending leave, inactive membership and old end dates never create checks',()=>{
 assert.deepEqual(dueLeaveReturns([leave('2026-11-10','2026-11-18',{historicalImport:true})],[person()],today),[]);
 assert.deepEqual(dueLeaveReturns([leave('2026-11-10','2026-11-18',{status:'pending'})],[person()],today),[]);
 assert.deepEqual(dueLeaveReturns([leave('2026-11-10','2026-11-18')],[{...person(),lifecycleState:'archived'}],today),[]);
 assert.deepEqual(dueLeaveReturns([leave('2026-10-01','2026-11-01')],[person()],today),[]);
 assert.deepEqual(dueLeaveReturns([leave('2026-11-10','2026-11-18')],[{...person(),status:'GESCHORST'}],today),[]);
});
test('return dates use calendar dates and cannot be confused with a different person',()=>{
 assert.equal(daysBefore('2026-11-19',14),'2026-11-05');
 assert.throws(()=>returnCheckId('politie','not-id','2026-11-18'));
 assert.equal(returnCheckPublic({dept:'politie',discordId:id,endDate:'2026-11-18',
  status:'CHECKING'}).status,'CHECKING');
});
test('leave overview separates current and upcoming approved periods',()=>{
 const info=leaveInformation([leave('2026-11-01','2026-11-19'),
  leave('2026-12-01','2026-12-08')],today);
 assert.deepEqual(info,{active:true,startDate:'2026-11-01',endDate:'2026-11-19',
  nextStart:'2026-12-01',nextEnd:'2026-12-08',lastEnded:null});
});
test('only attested Discord pings count, not a status-only review',()=>{
 const rows=[{type:'inactiviteitsping',activityStatus:'50/50',
  discordPingSent:false,createdAt:'2026-11-19T12:00:00Z'},
 {type:'inactiviteitsping',activityStatus:'INACTIEF',
  discordPingSent:true,createdAt:'2026-11-17T12:00:00Z'}];
 const count=dossierPingSummary(rows);
 assert.equal(count.registered,2);
 assert.equal(count.discordConfirmed,1);
 assert.equal(count.latestStatus,'50/50');
});
test('an open return check takes precedence over old tracker suggestions',()=>{
 const row={discordId:id,department:'politie',currentStatus:'Actief',
  kind:'beoordelen',reason:'Spreadsheet: 60 days'};
 const enriched=enrichActivityRow(row,{today,returnCheck:{
  status:'CHECKING',endDate:'2026-11-18'}});
 assert.equal(enriched.kind,'checking');
 assert.equal(enriched.returnChecking,true);
 assert.equal(enriched.currentStatus,'Actief');
 const stats=activityCenterStatistics([enriched]);
 assert.equal(stats.overall.checking,1);
 assert.equal(stats.overall.active,0);
});
test('unverified source cannot be described as validated FiveM playtime',()=>{
 const result=enrichActivityRow({discordId:id,department:'politie',
  kind:'ok',periodPlayHours:19}, {today});
 assert.equal(result.verified,false);
 assert.equal(result.periodLabel,'Sinds reset (oude bron)');
});
