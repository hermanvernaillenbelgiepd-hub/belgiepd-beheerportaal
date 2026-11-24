import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {projectBpdPlayerActivity,installScopedPlayerActivityRoutes}
 from '../src/bpd-player-activity-scope.js';
const id='622486684033875968',other='622486684033875970';
const data={status:'verified_api',playTimeMinutes:679,firstConnectionAt:'2026-10-09T06:00:00Z',
 lastConnectionAt:'2026-11-22T23:30:00Z',retrievedAt:'2026-11-24T09:00:00Z'};
test('no monthly status inferred from cumulative FiveM server-player response',()=>{
 const x=projectBpdPlayerActivity(data);
 assert.equal(x.totalPlayMinutes,679);
 assert.equal(x.monthlyHoursVerified,false);
 assert.equal(x.lastConnectionSignedByBot,false);
 assert.equal(x.lastConnectionAt,'2026-11-22T23:30:00.000Z');
 assert.equal(x.playHours,undefined);
 assert.equal(x.solicitation,undefined);
 assert.deepEqual(projectBpdPlayerActivity({status:'verified_api',playTimeMinutes:-1}),null);
});
test('server checks real department, exact dossier and rank before upstream lookup',async()=>{
 const app=express(),called=[];
 let actor={uid:'discord:'+other,discordId:other,role:'officierenkader',
  departments:['politie'],departmentRoles:{politie:'officierenkader'},
  dossierAllowedDepartments:['politie']};
 installScopedPlayerActivityRoutes(app,{
  requireUser:(req,_res,next)=>{req.bpd=actor;next()},
  getSnapshot:async()=>({stale:false,data:[{dept:'politie',personId:id,call:'316',
    rank:'Inspecteur van Politie',lifecycleState:'active'}]}),
  readPlayer:async discord=>{called.push(discord);return data}
 });
 const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
 const base='http://127.0.0.1:'+listener.address().port+'/api/fivem-players/dossiers/';
 try{
  let res=await fetch(base+'politie/'+id);
  assert.equal(res.status,200);
  const result=await res.json();
  assert.equal(result.totalPlayMinutes,679);
  assert.equal(result.monthlyHoursVerified,false);
  assert.equal(called.length,1);
  actor={...actor,role:'basiskader',departmentRoles:{politie:'basiskader'}};
  res=await fetch(base+'politie/'+id);
  assert.equal(res.status,403);assert.equal(called.length,1);
  actor={...actor,role:'officierenkader',departments:['brandweer'],
   departmentRoles:{brandweer:'officierenkader'}};
  res=await fetch(base+'politie/'+id);
  assert.equal(res.status,403);assert.equal(called.length,1);
  res=await fetch(base+'brandweer/'+id);
  // De actor heeft geen geverifieerde Brandweer-bevoegdheid: 403 vóór lookup.
  assert.equal(res.status,403);assert.equal(called.length,1);
 }finally{await new Promise(resolve=>listener.close(resolve))}
});
test('no data mutation or global API hours exposed by visual evidence',()=>{
 const dashboard=readFileSync(new URL('../public/activity-dashboard.js',import.meta.url),'utf8');
 const activity=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(dashboard,/renderSelectedStatus\(safe,lookupPlayer,observeRecovery\)/);
 assert.match(dashboard,/tasks\.slice\(0,25\)/);
 assert.match(dashboard,/Math\.min\(3,selected\.length\)/);
 assert.doesNotMatch(dashboard,/fetch\(|firebase|\/api\//);
 assert.match(activity,/readPlayerEvidence/);
 assert.match(activity,/api\/fivem-players\/dossiers/);
 assert.match(activity,/geen afgesloten maand|geen geverifieerde maanduren/);
 assert.match(server,/installScopedPlayerActivityRoutes\(app,\{requireUser:requireDossierUser,getSnapshot\}\)/);
 assert.doesNotMatch(readFileSync(new URL('../src/activity-center-details.js',import.meta.url),'utf8'),/bpd-player-activity-scope/);
});
