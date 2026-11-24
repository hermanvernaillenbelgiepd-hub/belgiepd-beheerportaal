import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {previousClosedDutyMonth,closedDutyMonth,projectDutyMonthlyObservation}
 from '../src/bpd-duty-monthly-preview.js';
import {installScopedDutyTimesRoutes} from '../src/bpd-duty-service-scope.js';
const id='622486684033875968';
const now=new Date('2026-11-24T09:15:00Z');
const hours={status:'verified_api',reportedMinutes:305,
 retrievedAt:'2026-11-24T09:15:00Z',shifts:[
 {department:'politie',service:'Interventie',minutes:60,
  startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T11:00:00Z',ongoing:false},
 {department:'politie',service:'Interventie',minutes:25,
  startedAt:'2026-10-31T22:20:00Z',endedAt:'2026-10-31T23:30:00Z',ongoing:false},
 {department:'politie',service:'Dispatch',minutes:35,
  startedAt:'2026-11-01T10:00:00Z',endedAt:'2026-11-01T10:35:00Z',ongoing:false},
 {department:'brandweer',service:'Zone',minutes:180,
  startedAt:'2026-10-16T08:00:00Z',endedAt:'2026-10-16T11:00:00Z',ongoing:false},
 {department:'politie',service:'Interventie',minutes:5,
  startedAt:'2026-10-29T07:00:00Z',endedAt:null,ongoing:true}
]};
test('last closed month uses Brussels midnight and rolls over the year',()=>{
 assert.equal(previousClosedDutyMonth(now),'2026-10');
 assert.equal(previousClosedDutyMonth(new Date('2027-01-01T00:30:00Z')),'2026-12');
 assert.equal(previousClosedDutyMonth(new Date('2026-11-01T00:30:00Z')),'2026-10');
 assert.equal(closedDutyMonth('2026-10',now),true);
 assert.equal(closedDutyMonth('2026-11',now),false);
 assert.equal(closedDutyMonth('2027-01',now),false);
 assert.equal(closedDutyMonth('2026-00',now),false);
 assert.equal(closedDutyMonth(['2026-10'],now),false);
});
test('October police tally excludes other services, ongoing and cross-month shifts',()=>{
 const x=projectDutyMonthlyObservation(hours,'politie','2026-10');
 assert.equal(x.month,'2026-10');
 assert.equal(x.recordedMinutes,60);
 assert.equal(x.completedShiftCount,1);
 assert.equal(x.excludedBoundary,1);
 assert.equal(x.excludedOngoing,1);
 assert.equal(x.byService[0].service,'Interventie');
 assert.equal(x.fullMonthVerified,false);
 assert.equal(x.usableForAutomaticPings,false);
 assert.equal(x.definitiveMonthlyHours,null);
 assert.doesNotMatch(JSON.stringify(x),/brandweer|Zone|180|305|622486/);
});
test('no matching record is unknown, never zero activity',()=>{
 const x=projectDutyMonthlyObservation(hours,'politie','2026-09');
 assert.equal(x.status,'not_confirmed');
 assert.equal(x.recordedMinutes,null);
 assert.equal(x.completedShiftCount,0);
 assert.equal(x.definitiveMonthlyHours,null);
});
test('server validates closed month and dossier scope before upstream API lookup',async()=>{
 const app=express(),calls=[];
 let actor={uid:'discord:622486684033875970',discordId:'622486684033875970',
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},dossierAllowedDepartments:['politie']};
 installScopedDutyTimesRoutes(app,{requireUser:(req,_res,next)=>{req.bpd=actor;next()},
  getSnapshot:async()=>({stale:false,data:[{dept:'politie',personId:id,
   call:'316',rank:'Inspecteur van Politie'}]}),
  readDuty:async which=>{calls.push(which);return hours},now:()=>now});
 const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
 const base='http://127.0.0.1:'+listener.address().port+'/api/duty-times/dossiers/';
 try{
  let r=await fetch(base+'politie/'+id+'?month=2026-10');
  assert.equal(r.status,200);
  let body=await r.json();
  assert.equal(body.monthlyPreview.recordedMinutes,60);
  assert.equal(body.monthlyPreview.fullMonthVerified,false);
  assert.equal(calls.length,1);
  r=await fetch(base+'politie/'+id+'?month=2026-11');
  assert.equal(r.status,400);assert.equal(calls.length,1);
  actor={...actor,role:'basiskader',departmentRoles:{politie:'basiskader'}};
  r=await fetch(base+'politie/'+id+'?month=2026-10');
  assert.equal(r.status,403);assert.equal(calls.length,1);
  actor={...actor,role:'officierenkader',departments:['brandweer'],
   departmentRoles:{brandweer:'officierenkader'}};
  r=await fetch(base+'politie/'+id+'?month=2026-10');
  assert.equal(r.status,403);assert.equal(calls.length,1);
 }finally{await new Promise(resolve=>listener.close(resolve))}
});
