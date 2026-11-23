import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 bpdAppApiConfigured,normalizedServerPlayer,fivemEligibility,
 readPersonalBpdAppHours,inspectOwnDutyTimesShape
} from '../src/bpd-app-hours.js';
const user='622486684033875968',other='722486684033875968',
 token='not-a-real-secret-for-tests';
const env={BPD_ENABLE_BPD_APP_HOURS:'true',BPD_APP_API_BEARER_TOKEN:token};
const clock=new Date('2026-11-23T19:00:00.000Z');
const player={discord_id:user,name:'Test',play_time_minutes:720,
 first_connection_at:'2026-11-01T09:00:00.000Z',
 last_connection_at:'2026-11-22T15:15:00.000Z'};
const fake=(payload,requests)=>async(url,options)=>{
 requests.push({url,options});
 return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(payload)};
};
test('read-only client uses only server-side bearer for the exact verified person',async()=>{
 const called=[];
 const value=await readPersonalBpdAppHours(user,{env,fetchImpl:fake(player,called),now:clock});
 assert.equal(called.length,1);
 assert.equal(called[0].url,'https://app.belgiepd.be/api/v1/server-players/'+user);
 assert.equal(called[0].options.headers.Authorization,'Bearer '+token);
 assert.equal(value.playHours,12);
 assert.equal(value.playTimeMinutes,720);
 assert.equal(value.solicitation.eligible,true);
 assert.equal(value.firstConnectionAt,player.first_connection_at);
 assert.equal(JSON.stringify(value).includes(token),false,'never reveal token');
});
test('no remote requests unless flag and bearer both configured',async()=>{
 const called=[];
 assert.equal(bpdAppApiConfigured({}),false);
 const data=await readPersonalBpdAppHours(user,{env:{},fetchImpl:fake(player,called)});
 assert.equal(data.status,'not_configured');
 assert.equal(called.length,0);
 const bad=await readPersonalBpdAppHours('not-a-discord-id',{env,fetchImpl:fake(player,called)});
 assert.equal(bad.status,'invalid_identity');
 assert.equal(called.length,0);
});
test('mismatching Discord identity or unsafe playtime cannot become evidence',()=>{
 assert.equal(normalizedServerPlayer({...player,discord_id:other},user),null);
 assert.equal(normalizedServerPlayer({...player,play_time_minutes:-3},user),null);
 assert.equal(normalizedServerPlayer({...player,play_time_minutes:9007199254740992},user),null);
 assert.equal(normalizedServerPlayer({...player,play_time_minutes:599},user).playHours,9.98);
 const threshold=fivemEligibility({playTimeMinutes:599,firstConnectionAt:'2026-11-01T00:00:00Z'},clock);
 assert.equal(threshold.eligible,false);
 assert.equal(fivemEligibility({playTimeMinutes:600,firstConnectionAt:'2026-11-21T00:00:00Z'},clock).eligible,false);
 assert.equal(fivemEligibility({playTimeMinutes:600,firstConnectionAt:null},clock).eligible,null);
});
test('duty-times probe does not invent a department, duration, or value',async()=>{
 const requests=[];
 const duty=await inspectOwnDutyTimesShape(user,{
   env,fetchImpl:fake([{test_do_not_assume:'99 hours',department:'politie'}],requests)
 });
 assert.deepEqual(duty,{status:'schema_unverified',format:'array',hasCollection:true,hasRecords:true});
 assert.equal(requests[0].url,'https://app.belgiepd.be/api/v1/duty-times/'+user);
 assert.equal(JSON.stringify(duty).includes('99 hours'),false);
 assert.equal(JSON.stringify(duty).includes('politie'),false);
});
test('personal profile uses OAuth-verified identity only and does not grant rights',()=>{
 const server=readFileSync(new URL('../src/discord-personal-profile.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 assert.match(server,/verifiedDiscordIdentity\(decoded,member,process\.env\.DISCORD_GUILD_ID\)!==id/);
 assert.match(server,/readPersonalBpdAppHours\(id\)/);
 assert.match(server,/inspectOwnDutyTimesShape\(id\)/);
 assert.match(ui,/id="myBpdTotalHours"/);
 assert.match(ui,/id="myBpdLastConnection"/);
 assert.match(ui,/id="myBpdDutyHours"/);
 assert.match(ui,/renderBpdHours\(p\.bpdHours,p\.dutyTimes\)/);
 assert.doesNotMatch(server,/\/v1\/discord\/role-(assignments|removals)/);
});
