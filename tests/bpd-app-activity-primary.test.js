import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchAppActivityIndex,appActivityPrimaryEnabled} from '../src/bpd-app-player-index.js';
const id1='622486684033875968',id2='722486684033875968';
const env={BPD_ENABLE_BPD_APP_HOURS:'true',BPD_ACTIVITY_API_PRIMARY:'true',
 BPD_APP_API_BEARER_TOKEN:'fake-test-token'};
const player=(id,minutes)=>({discord_id:id,name:'Test',play_time_minutes:minutes,
 first_connection_at:'2026-10-01T07:30:00Z',last_connection_at:'2026-11-22T13:00:00Z'});
const page=(current,last,rows)=>({
 data:rows,meta:{current_page:current,last_page:last},
 links:{first:null,last:null,prev:null,next:null}});
function mock(responses,urls){
 return async(url,opt)=>{
  urls.push({url,opt});
  const data=responses.shift();
  return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(data)};
 }
}
const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('disabled by default and fails closed without token',async()=>{
 assert.equal(appActivityPrimaryEnabled({}),false);
 assert.equal((await fetchAppActivityIndex({env:{}})).status,'disabled');
 assert.equal((await fetchAppActivityIndex({env:{BPD_ACTIVITY_API_PRIMARY:'true'}})).status,'not_configured');
});
test('reads every documented paginator page, always fixed host and Bearer on server',async()=>{
 const urls=[];
 const result=await fetchAppActivityIndex({
  env,now:Date.parse('2026-11-23T20:00:00Z'),
  fetchImpl:mock([page(1,2,[player(id1,600)]),page(2,2,[player(id2,1200)])],urls)
 });
 assert.equal(result.status,'ok');
 assert.equal(result.players.get(id1).playHours,10);
 assert.equal(result.players.get(id2).playHours,20);
 assert.equal(result.fetchedAt,'2026-11-23T20:00:00.000Z');
 assert.deepEqual(urls.map(x=>x.url),[
  'https://app.belgiepd.be/api/v1/server-players',
  'https://app.belgiepd.be/api/v1/server-players?page=2'
 ]);
 assert.ok(urls.every(x=>x.opt.headers.Authorization==='Bearer fake-test-token'));
 assert.equal(JSON.stringify([...result.players.values()]).includes('fake-test-token'),false);
});
test('refuse incomplete/malformed pagination and floating-point Discord identities',async()=>{
 let out=await fetchAppActivityIndex({env,fetchImpl:mock([page(1,2,[])],[])});
 assert.equal(out.status,'unavailable');
 out=await fetchAppActivityIndex({env,fetchImpl:mock([page(1,1,[{
   ...player(id1,600),discord_id:Number(id1)
 }])],[])});
 assert.equal(out.status,'invalid_response');
 out=await fetchAppActivityIndex({env,fetchImpl:mock([page(1,81,[])],[])});
 assert.equal(out.status,'invalid_response');
});
test('never convert API cumulative minutes to a completed calendar-month ping',()=>{
 const route=text('src/activity-center-routes.js'),ui=text('public/activiteitscentrum.html');
 assert.match(route,/const usingApi=appApi.status==='ok'/);
 assert.match(route,/const legacy=usingApi\?\{rows:\[\],available:false\}:await loadOptionalSheet\(readSheet\)/);
 assert.match(route,/periodPlayHours:copy.verified\?copy.periodPlayHours:null/);
 assert.match(route,/kind:apiPlayer\?'geen_maandmeting':'geen_data'/);
 assert.match(ui,/BelgiëPD-API totaal:/);
 assert.match(ui,/niet de huidige maand/);
 assert.match(route,/canReadPersonnelSubject\(req\.bpd,person\)/);
 assert.doesNotMatch(route,/storeAutomaticPing|BPD_ENABLE_ACTIVITY_AUTO_PINGS/);
});
