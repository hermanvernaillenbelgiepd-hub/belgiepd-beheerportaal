import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import {once} from 'node:events';
import {integrationsSummary,readIntegrations,installTechnicalIntegrationStatusRoutes}
 from '../src/technical-integration-status.js';
const id='123456789012345678',now=Date.UTC(2026,10,23,9);
const actor={uid:'discord:'+id,discordId:id,role:'officierenkader',
 departments:['politie'],departmentRoles:{politie:'officierenkader'}};
const env={BPD_ENABLE_DISCORD_PORTAL_LOGIN:'true',DISCORD_CLIENT_ID:'123456789012345679',
 DISCORD_CLIENT_SECRET:'safe-example-for-tests-only',DISCORD_GUILD_ID:'123456789012345670',
 DISCORD_REDIRECT_URI:'https://administratie.belgiepd.be/auth/discord/callback',
 BPD_DISCORD_BOT_TOKEN:'a'.repeat(60),BPD_DISCORD_USERS_API_TOKEN:'access-token-for-test',
 BPD_ENABLE_CALLSIGN_BOT_INGEST:'true',BPD_ENABLE_ACTIVITY_TELEMETRY:'true',
 BPD_CALLSIGN_BOT_WEBHOOK_SECRET:'s'.repeat(48)};
const event=date=>({docs:[{get:field=>field==='receivedAt'?{toDate:()=>new Date(date)}:null}]});
const db=(hasData=true)=>({collection:name=>({
 doc:()=>({get:async()=>({exists:true})}),
 orderBy:()=>({limit:()=>({get:async()=>hasData?event(now-600000):{docs:[]}})})
})});
test('all six links distinguish configured, verified, and recent telemetry',async()=>{
 const data=await readIntegrations({actor,env,db:db(),now});
 assert.deepEqual(data.integrations.map(x=>x.id),
  ['discord','discord-bot','discord-roles','hours','activity','firebase']);
 assert.deepEqual(data.integrations.map(x=>x.state),
  ['connected','configured','configured','connected','connected','connected']);
 assert.equal(data.integrations[3].lastReceivedAt,new Date(now-600000).toISOString());
 assert.doesNotMatch(JSON.stringify(data),/safe-example-for-tests-only|access-token-for-test|123456789012345678/);
});
test('configuration alone is not a connected tracker',async()=>{
 const data=await readIntegrations({actor,env,db:db(false),now});
 assert.equal(data.integrations.find(x=>x.id==='hours').state,'waiting');
 assert.equal(data.integrations.find(x=>x.id==='activity').state,'waiting');
 const disabled=integrationsSummary(actor,{},{
  firebase:{status:'rejected'},hours:{status:'fulfilled',value:null},
  activity:{status:'fulfilled',value:null}
 },now);
 assert.deepEqual(disabled.integrations.map(x=>x.state),
  ['disabled','disabled','disabled','disabled','disabled','error']);
});
test('stale telemetry and Firestore failures are not labelled connected',async()=>{
 const before=event(now-9*86400000);
 const bad={collection:name=>{
  if(name==='bpd_portal_technical_settings')return {doc:()=>({get:async()=>{throw Error('down')}})};
  return {orderBy:()=>({limit:()=>({get:async()=>before})})};
 }};
 const result=await readIntegrations({actor,env,db:bad,now});
 assert.equal(result.integrations.find(x=>x.id==='hours').state,'waiting');
 assert.equal(result.integrations.find(x=>x.id==='activity').state,'waiting');
 assert.equal(result.integrations.find(x=>x.id==='firebase').state,'error');
});
test('integration endpoint rejects ordinary members and serves only sanitized read-only status',async()=>{
 const app=express();let current=actor;
 installTechnicalIntegrationStatusRoutes(app,{requireUser:(req,_res,next)=>{req.bpd=current;next()},
  env,dbFactory:()=>db(),now:()=>now});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try{
  let result=await fetch(base+'/api/technical-center/integrations');
  assert.equal(result.status,200);
  assert.match(result.headers.get('cache-control'),/no-store/);
  const body=await result.json();assert.equal(body.integrations.length,6);
  current={...actor,role:'basiskader',departmentRoles:{politie:'basiskader'}};
  result=await fetch(base+'/api/technical-center/integrations');
  assert.equal(result.status,403);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('Beheercentrum reveals the panel only after center authorization',()=>{
 const p=readFileSync(new URL('../public/beheercentrum.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(p,/id="integrations"[^>]+hidden/);
 assert.match(p,/href="#integrations"/);
 assert.match(p,/id="integrationReload"/);
 assert.match(p,/api\('\/api\/technical-center\/integrations'\)/);
 assert.match(p,/const next=await api\('\/api\/technical-center\/context'\)/);
 assert.match(server,/installTechnicalIntegrationStatusRoutes\(app,\{requireUser\}\)/);
});
