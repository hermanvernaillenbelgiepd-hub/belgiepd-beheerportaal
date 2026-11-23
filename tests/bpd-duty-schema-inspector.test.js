import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {safeDutyStructure,inspectDutySchema} from '../src/bpd-duty-schema.js';
import {installTechnicalIntegrationStatusRoutes} from '../src/technical-integration-status.js';
const id='622486684033875968';
const env={BPD_ENABLE_BPD_APP_HOURS:'true',BPD_APP_API_BEARER_TOKEN:'not-real-secret-for-tests'};
const fake=(value,calls)=>async(url,options)=>{calls.push({url,options});
 return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(value)}};
test('returns only field names and types, never values or numeric snowflake keys',()=>{
 const data=safeDutyStructure({records:[{
  discord_id:id,name:'Restricted person',service:'brandweer',
  duty_minutes:125,notes:'sensitive text'
 }]});
 assert.ok(data.recordFields.some(x=>x.field==='duty_minutes'&&x.type==='number'));
 assert.doesNotMatch(JSON.stringify(data),/Restricted person|brandweer|sensitive text|622486|125/);
 assert.deepEqual(safeDutyStructure({[id]:{records:[]}}).rootFields,[]);
});
test('calls only the two fixed GET routes with server-held bearer and no duty hours',async()=>{
 const calls=[];
 const self=await inspectDutySchema('self',id,{env,fetchImpl:fake([{service:'politie',minutes:15}],calls)});
 const all=await inspectDutySchema('all',id,{env,fetchImpl:fake([],calls)});
 assert.equal(self.status,'schema_unverified');
 assert.equal(all.status,'schema_unverified');
 assert.deepEqual(calls.map(x=>x.url),[
 'https://app.belgiepd.be/api/v1/duty-times/'+id,
 'https://app.belgiepd.be/api/v1/duty-times'
 ]);
 assert.ok(calls.every(x=>x.options.headers.Authorization==='Bearer '+env.BPD_APP_API_BEARER_TOKEN));
 assert.equal((await inspectDutySchema('all',id,{env:{},fetchImpl:fake([],calls)})).status,'not_configured');
 assert.equal(calls.length,2);
});
test('protected diagnostics endpoint is only callable by the verified technical administrator',async()=>{
 const app=express(),calls=[];
 let actor={uid:'discord:'+id,discordId:id,role:'beheerder',
  portalTechnicalMode:true,profileTechnicalAvailable:true};
 installTechnicalIntegrationStatusRoutes(app,{env,
  requireUser:(req,_res,next)=>{req.bpd=actor;next()},
  dutyFetchImpl:fake({data:[{duty_minutes:10,discord_id:id,department:'politie'}]},calls)
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/technical-center/bpd-duty-schema';
  let result=await fetch(url);
  assert.equal(result.status,200);
  assert.match(result.headers.get('cache-control'),/no-store/);
  const data=await result.json();
  assert.equal(data.readOnly,true);
  assert.equal(data.personal.status,'schema_unverified');
  assert.doesNotMatch(JSON.stringify(data),/622486|politie|not-real-secret-for-tests/);
  assert.equal(calls.length,2);
  actor={uid:'discord:'+id,discordId:id,role:'officierenkader',
   departments:['politie'],departmentRoles:{politie:'officierenkader'}};
  result=await fetch(url);
  assert.equal(result.status,403);
  assert.equal(calls.length,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('Beheercentrum reveals probe only in technical mode and no secrets enter browser source',()=>{
 const html=readFileSync(new URL('../public/beheercentrum.html',import.meta.url),'utf8');
 assert.match(html,/id="dutySchemaInspector" hidden/);
 assert.match(html,/\$\('dutySchemaInspector'\)\.hidden=!next\.canEdit/);
 assert.match(html,/api\('\/api\/technical-center\/bpd-duty-schema'\)/);
 assert.doesNotMatch(html,/BPD_APP_API_BEARER_TOKEN/);
});
