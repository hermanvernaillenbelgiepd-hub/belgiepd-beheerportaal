import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {recentVerifiedProof,installCallsignSelfServiceRoutes} from '../src/callsign-selfservice-routes.js';

const id='111111111111111111';
const now=Date.parse('2026-10-24T16:00:00Z');
const evidence={
  discordId:id,source:'fivem-bot-en-discord-api',eligible:true,
  hasFiveDays:true,hasTenHours:true,playHours:10,
  checkedAt:new Date(now-60000).toISOString()
};
test('Eigen vaste roepnummeraanvraag vereist verse, ondertekend verkregen 5-dagen en 10-urenstatus',()=>{
  assert.equal(recentVerifiedProof(evidence,id,now),true);
  const invalid=[
    {...evidence,discordId:'222222222222222222'},
    {...evidence,source:'manual'},
    {...evidence,eligible:false},
    {...evidence,hasFiveDays:false},
    {...evidence,hasTenHours:false},
    {...evidence,checkedAt:new Date(now-25*3600000).toISOString()},
    {...evidence,checkedAt:new Date(now+120000).toISOString()},
    null
  ];
  for(const proof of invalid)assert.equal(recentVerifiedProof(proof,id,now),false);
  assert.equal(typeof installCallsignSelfServiceRoutes,'function');
});

test('Selfservice requests are tied to own verified Discord uid and cannot approve',()=>{
  const s=readFileSync(new URL('../src/callsign-selfservice-routes.js',import.meta.url),'utf8');
  const bot=readFileSync(new URL('../src/callsign-bot-routes.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(s,/verifiedDiscordIdentity\(decoded,member\.data\(\),process\.env\.DISCORD_GUILD_ID/);
  assert.match(s,/checkApplicant\(\{name:raw\.name,temporaryCall:raw\.temporaryCall,discordId:id\}\)/);
  assert.match(s,/if\(!recentVerifiedProof\(proof\.data\(\),id\)\)/);
  assert.match(s,/tx\.create\(reqRef,\{\.\.\.data,status:'verified'/);
  assert.match(s,/tx\.create\(callRef/);
  assert.match(s,/collection\('bpd_temporary_call_reservations'\)/);
  assert.doesNotMatch(s,/performPoliceSync\s*\(/);
  assert.doesNotMatch(s,/status:'approved'/);
  assert.match(bot,/tx\.set\(evidenceRef,evidence\)/);
  assert.match(bot,/if\(request\.exists&&\['submitted','needs_verification','verified'\]\.includes/);
  assert.match(server,/installCallsignSelfServiceRoutes\(app,\{getSnapshot\}\)/);
});

test('Nieuwe aanvraagpagina gebruikt enkel eigen Discord-login en toont botvoorwaarden',()=>{
  const html=readFileSync(new URL('../public/vast-roepnummer-aanvragen.html',import.meta.url),'utf8');
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  // Replace dynamic imports only for parsing: the JavaScript syntax must remain valid.
  assert.doesNotThrow(()=>new Script(script));
  assert.match(html,/id="tempCall" type="number" min="101" max="199"/);
  assert.match(html,/minstens <strong>5 volledige dagen<\/strong>/);
  assert.match(html,/api\/callsigns\/self\/status/);
  assert.match(html,/api\/callsigns\/self\/request/);
  assert.match(html,/auth\/discord\/start\?return=/);
  assert.match(html,/!ctx\.eligible\|\|!!ctx\.request\|\|!ctx\.requestsEnabled/);
});
