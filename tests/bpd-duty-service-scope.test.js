import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {projectScopedDutyTimes,installScopedDutyTimesRoutes}
 from '../src/bpd-duty-service-scope.js';
const id='622486684033875968';
const data={status:'verified_api',reportedMinutes:115,
 retrievedAt:'2026-11-24T09:00:00Z',
 shifts:[{department:'politie',service:'Interventie',minutes:40,
 startedAt:'2026-11-23T10:00:00Z',endedAt:'2026-11-23T10:40:00Z',ongoing:false},
 {department:'brandweer',service:'Zone',minutes:75,
 startedAt:'2026-11-24T11:00:00Z',endedAt:null,ongoing:true}]};
test('geen globale of dienstvreemde uren uitlekken',()=>{
 const police=projectScopedDutyTimes(data,'politie');
 assert.equal(police.status,'verified_service_shifts');
 assert.equal(police.minutes,40);assert.equal(police.shiftCount,1);
 assert.equal(police.monthlyHoursVerified,false);
 assert.doesNotMatch(JSON.stringify(police),/brandweer|Zone|115|75|622486/);
 assert.equal(projectScopedDutyTimes(data,'brandweer').ongoingShifts,1);
});
test('onbekende dienstcodes zijn niet gelijk aan 0 uur',()=>{
 const unknown={...data,shifts:[{...data.shifts[0],department:'unknown'}]};
 assert.equal(projectScopedDutyTimes(unknown,'politie').status,'unmapped');
 assert.equal(projectScopedDutyTimes({...data,shifts:[]},'politie').status,'unmapped');
 assert.equal(projectScopedDutyTimes({...data,reportedMinutes:0,shifts:[]},'politie').status,'no_records');
});
test('toegang wordt gecontroleerd voor de API wordt geraadpleegd',async()=>{
 const app=express(),called=[];
 let actor={uid:'discord:622486684033875970',discordId:'622486684033875970',
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},dossierAllowedDepartments:['politie']};
 installScopedDutyTimesRoutes(app,{requireUser:(req,_res,next)=>{req.bpd=actor;next()},
  getSnapshot:async()=>({stale:false,data:[{dept:'politie',personId:id,
    call:'316',rank:'Inspecteur van Politie'}]}),
  readDuty:async x=>{called.push(x);return data}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port+'/api/duty-times/dossiers/';
 try{
  let res=await fetch(url+'politie/'+id);
  assert.equal(res.status,200);assert.equal((await res.json()).minutes,40);
  assert.equal(called.length,1);
  actor={...actor,role:'basiskader',departmentRoles:{politie:'basiskader'}};
  res=await fetch(url+'politie/'+id);
  assert.equal(res.status,403);assert.equal(called.length,1);
  actor={...actor,role:'officierenkader',departments:['brandweer'],
    departmentRoles:{brandweer:'officierenkader'}};
  res=await fetch(url+'politie/'+id);
  assert.equal(res.status,403);assert.equal(called.length,1);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
