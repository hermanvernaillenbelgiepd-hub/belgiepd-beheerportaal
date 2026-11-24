import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {candidatePrecheck,installCandidatePrecheckRoutes}
 from '../src/candidate-precheck-routes.js';
import {validReturnTo} from '../src/discord-utils.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='298799630458552323',guild='298799630458552324';
const now=new Date('2026-11-24T11:00:00Z');
const decoded={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,
 firebase:{sign_in_provider:'custom'}};
const member={guildId:guild,verifiedAt:now.getTime()-60000,roleIds:[]};
const proof={status:'verified_api',playTimeMinutes:601,
 firstConnectionAt:'2026-11-18T10:00:00Z',
 lastConnectionAt:'2026-11-23T11:00:00Z',retrievedAt:now.toISOString()};
test('10h and 5 days are BOTH required; no confusion with 5h recovery',()=>{
 const ok=candidatePrecheck(proof,now);
 assert.equal(ok.status,'api_thresholds_met');
 assert.equal(ok.playHoursMet,true);
 assert.equal(ok.fiveDaysMet,true);
 assert.equal(ok.eligibleByApi,true);
 assert.equal(ok.requiredPlayMinutes,600);
 assert.equal(ok.requiredServerDays,5);
 assert.equal(ok.verifiedForAdmission,false);
 assert.equal(ok.applicationsOpen,false);
 assert.equal(ok.canSubmit,false);
 assert.equal(ok.readOnly,true);
 for(const alter of [
  {...proof,playTimeMinutes:599},
  {...proof,firstConnectionAt:'2026-11-23T11:00:00Z'}
 ]){
  const result=candidatePrecheck(alter,now);
  assert.equal(result.status,'not_yet_eligible');
  assert.equal(result.eligibleByApi,false);
  assert.equal(result.canSubmit,false);
 }
 const missing=candidatePrecheck({...proof,firstConnectionAt:null},now);
 assert.equal(missing.status,'verification_required');
 assert.equal(missing.eligibleByApi,null);
 assert.equal(missing.firstConnectionAt,null);
});
test('unavailable API never implies 0 hours or admission',()=>{
 for(const status of ['not_configured','unauthorized','upstream_unavailable','invalid_response']){
  const x=candidatePrecheck({status},now);
  assert.equal(x.status,'verification_required');
  assert.equal(x.playMinutes,null);
  assert.equal(x.playHoursMet,null);
  assert.equal(x.fiveDaysMet,null);
  assert.equal(x.canSubmit,false);
 }
});
test('GET is scoped only to verified own Discord ID; applicant needs no personnel approval',async()=>{
 const app=express(),calls=[];
 let who=decoded,memberDoc=member,accountDoc=null;
 installCandidatePrecheckRoutes(app,{
  verifyToken:async token=>{if(token!=='self-token')throw Error('invalid token');return who},
  getMember:async uid=>({data:()=>{assert.equal(uid,id);return memberDoc}}),
  getAccount:async uid=>({data:()=>{assert.equal(uid,id);return accountDoc}}),
  readPlayer:async uid=>{calls.push(uid);return proof},
  env:{DISCORD_GUILD_ID:guild},now:()=>now
 });
 const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
 const url='http://127.0.0.1:'+listener.address().port+
  '/api/sollicitatiecentrum/mijn-voorwaarden';
 const get=async(extra='')=>fetch(url+extra,{
  headers:{Authorization:'Bearer self-token'}});
 try{
  let resp=await fetch(url);assert.equal(resp.status,401);
  assert.equal(calls.length,0);
  resp=await get('?discordId=999999999999999999');
  assert.equal(resp.status,200);
  assert.equal(calls.length,1);assert.equal(calls[0],id);
  let data=await resp.json();assert.equal(data.canSubmit,false);
  assert.equal(data.playMinutes,601);
  assert.equal(data.source,'bpd-app-server-player');
  assert.equal(data.discordId,undefined);
  resp=await fetch(url,{method:'POST',headers:{Authorization:'Bearer self-token'}});
  assert.equal(resp.status,404);
  assert.equal(calls.length,1);
  who={...decoded,uid:'google:admin'};
  resp=await get();assert.equal(resp.status,403);
  who=decoded;memberDoc={...member,verifiedAt:now.getTime()-8*86400000};
  resp=await get();assert.equal(resp.status,403);
  memberDoc=member;accountDoc={status:'blocked'};
  resp=await get();assert.equal(resp.status,403);
  assert.equal(calls.length,1);
 }finally{await new Promise(resolve=>listener.close(resolve))}
});
test('Discord login returns to Sollicitatiecentrum after own identity exchange',()=>{
 assert.equal(validReturnTo('/sollicitatiecentrum.html'),'/sollicitatiecentrum.html');
 assert.equal(validReturnTo('/sollicitatiebeheer.html'),'/discord-status.html');
 assert.equal(validReturnTo('https://phishing.example/'),'/discord-status.html');
 const status=read('public/discord-status.html');
 assert.match(status,/safe\.has\(returnTo\)/);
 assert.match(status,/sollicitatiecentrum\.html/);
});
test('existing page is read-only, accessible in light and dark, and cannot submit an application',()=>{
 const html=read('public/sollicitatiecentrum.html');
 const backend=read('src/candidate-precheck-routes.js');
 const server=read('src/server.js');
 assert.match(html,/id="checkEligibility"/);
 assert.match(html,/id="precheckStatus"/);
 assert.match(html,/data-dept="politie"/);
 assert.match(html,/data-dept="ambulance"/);
 assert.match(html,/data-dept="brandweer"/);
 assert.match(html,/data-dept="depannage"/);
 assert.match(html,/data-dept="burger"/);
 assert.match(html,/10 totale FiveM-speeluren/);
 assert.match(html,/5 dagen sinds je eerste serververbinding/);
 assert.match(html,/Sollicitaties zijn momenteel niet geopend/);
 assert.match(html,/data-bpd-theme="light"/);
 assert.match(html,/setupPortalLogin/);
 assert.doesNotMatch(html,/api\/service-applications\/submit|api\/sollicitaties\/submit/);
 assert.match(server,/installCandidatePrecheckRoutes\(app\)/);
 assert.doesNotMatch(backend,/tx\.set|tx\.create|\.add\(|\.set\(|\.update\(|getSnapshot|sendDiscord|assignRole/);
 const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:inline,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
