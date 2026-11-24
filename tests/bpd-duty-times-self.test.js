import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {normalizePersonalDutyTimes,readOwnDutyTimes,installOwnDutyTimesRoutes}
 from '../src/bpd-own-duty-times.js';
const id='622486684033875968',other='622486684033875969';
const env={BPD_ENABLE_BPD_APP_HOURS:'true',BPD_APP_API_BEARER_TOKEN:'test-only-secret'};
const fixture={discord_id:id,name:'Example member',minutes:95,from:'2026-11-01T00:00:00Z',
 till:'2026-11-24T00:00:00Z',shifts:[
  {service:'SIV',department:'politie',started_at:'2026-11-01T10:00:00Z',
   ended_at:'2026-11-01T11:00:00Z',minutes:60,is_ongoing:false},
  {service:'Zone',department:'brandweer',started_at:'2026-11-02T10:00:00Z',
   ended_at:null,minutes:35,is_ongoing:true}
 ]};
test('exact API response produces separately labelled minutes, retains ongoing and period',()=>{
 const a=normalizePersonalDutyTimes(fixture,id,new Date('2026-11-24T09:00:00Z'));
 assert.equal(a.reportedMinutes,95);
 assert.equal(a.shiftMinutes,95);
 assert.equal(a.reconciled,true);
 assert.equal(a.byService.length,2);
 assert.equal(a.byService.find(x=>x.department==='brandweer').ongoing,1);
 assert.equal(a.monthlyHoursVerified,false);
 assert.equal(a.shifts[0].ongoing,true);
 assert.equal(a.period.from,'2026-11-01T00:00:00.000Z');
 assert.equal(a.name,undefined);
 assert.equal(a.discordId,undefined);
});
test('a reported total never overrides incomplete shift sums or becomes month hours',()=>{
 const a=normalizePersonalDutyTimes({...fixture,minutes:105},id);
 assert.equal(a.reportedMinutes,105);
 assert.equal(a.shiftMinutes,95);
 assert.equal(a.reconciled,false);
 assert.equal(a.monthlyHoursVerified,false);
});
test('invalid identity, cross-account payload and malformed shifts fail closed',()=>{
 assert.equal(normalizePersonalDutyTimes(fixture,other),null);
 assert.equal(normalizePersonalDutyTimes({...fixture,shifts:[{...fixture.shifts[0],minutes:-1}]},id),null);
 assert.equal(normalizePersonalDutyTimes({...fixture,shifts:[{...fixture.shifts[0],service:'',department:''}]},id),null);
 assert.equal(normalizePersonalDutyTimes({...fixture,shifts:[{...fixture.shifts[0],ended_at:null}]},id),null);
 assert.equal(normalizePersonalDutyTimes({...fixture,shifts:[]},id).reconciled,false);
});
test('only authenticated user gets their own data and upstream token stays server-side',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});
  return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(fixture)}};
 const app=express();let actor={uid:'discord:'+id,discordId:id,role:'basiskader'};
 installOwnDutyTimesRoutes(app,{env,fetchImpl,
  requireUser:(req,res,next)=>{req.bpd=actor;next()}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/duty-times/me';
  let response=await fetch(url);let data=await response.json();
  assert.equal(response.status,200);assert.equal(data.status,'verified_api');
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://app.belgiepd.be/api/v1/duty-times/'+id);
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+env.BPD_APP_API_BEARER_TOKEN);
  assert.doesNotMatch(JSON.stringify(data),/test-only-secret|Example member|622486/);
  actor={uid:'discord:'+other,discordId:id,role:'basiskader'};
  response=await fetch(url);assert.equal(response.status,403);
  assert.equal(calls.length,1);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('disabled configuration and bad API payload do not return invented hours',async()=>{
 assert.equal((await readOwnDutyTimes(id,{env:{}})).status,'not_configured');
 const fetchImpl=async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({...fixture,discord_id:other})});
 assert.equal((await readOwnDutyTimes(id,{env,fetchImpl})).status,'invalid_response');
});
test('profile includes a separate own-only display and has no browser bearer secret',()=>{
 const html=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(html,/id="myDuty"/);assert.match(html,/id="dutyByService"/);
 assert.match(html,/fetch\('\/api\/duty-times\/me'/);
 assert.match(html,/data\.monthlyHoursVerified|Geen automatische activiteitspings/);
 assert.doesNotMatch(html,/BPD_APP_API_BEARER_TOKEN/);
 assert.match(server,/installOwnDutyTimesRoutes\(app,\{requireUser\}\)/);
});
