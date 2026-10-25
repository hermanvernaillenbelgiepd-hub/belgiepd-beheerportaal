import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {newcomerPortalMode,publicPoliceRoster} from '../src/member-dashboard-routes.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='111111111111111111',id2='222222222222222222',id3='333333333333333333';
const approved={status:'approved',discordId:id,role:'basiskader',departments:['politie'],departmentRoles:{politie:'basiskader'}};
const member=(call,personId=id)=>({dept:'politie',personId,call,name:'Voorbeeld lid',rank:'Agent van politie',series:'Reeks 3',status:'Actief'});
test('Nieuw of voorlopig Agentenkader krijgt beperkte startpagina zonder kaderrechten',()=>{
 assert.equal(newcomerPortalMode(id,null,[]),'member');
 assert.equal(newcomerPortalMode(id,{status:'pending'},[member('150')]),'member');
 assert.equal(newcomerPortalMode(id,approved,[member('150')]),'member');
 assert.equal(newcomerPortalMode(id,approved,[member('250')]),'member');
 assert.equal(newcomerPortalMode(id,approved,[member('300')]),'member');
 assert.equal(newcomerPortalMode(id,approved,[]),'member');
 assert.equal(newcomerPortalMode(id,null,[],true),'staff');
 assert.equal(newcomerPortalMode(id,{
  ...approved,role:'middenkader',departmentRoles:{politie:'middenkader'}
 },[member('700')]),'staff');
 assert.equal(newcomerPortalMode(id,{status:'blocked'},[]),'blocked');
 assert.equal(newcomerPortalMode(id,{status:'approved',discordId:id,role:'korpsleiding',departments:['politie'],departmentRoles:{politie:'korpsleiding'}},[member('900')]),'staff');
});
test('Nieuwe leden krijgen alleen leesbare personeelslijst, zonder dossier- of Discord-ID',()=>{
 const records=publicPoliceRoster([
  {dept:'brandweer',personId:id,name:'Niet tonen',call:'900'},
  {...member('900',id),name:'Korpsleiding',secret:'PRIVE'},
  {...member('930',id2),name:'Officier'},
  {...member('250',id3),name:'Agent'},
  {...member('220',id3),name:'dubbele identiteit'},
  {...member('008','444444444444444444'),name:'Beheer'},
  {...member('150','ongeldig'),name:'Ongeverifieerd'}
 ]);
 assert.deepEqual(records.map(p=>p.call),['930','900','250','008']);
 for(const p of records){
  assert.deepEqual(Object.keys(p).sort(),['call','name','rank','series','status'].sort());
  assert.equal('personId' in p,false);
  assert.equal('discordId' in p,false);
  assert.equal('secret' in p,false);
 }
});
test('Startdashboard toont enkel persoonlijke modules tot de rol server-side bevestigd is',()=>{
 const index=read('public/index.html');
 const server=read('src/server.js');
 const route=read('src/member-dashboard-routes.js');
 const html=read('public/personeelslijst.html');
 assert.match(index,/id="staffDashboard" hidden/);
 assert.match(index,/id="memberDashboard" hidden/);
 assert.match(index,/id="staffNav"[^>]*hidden/);
 assert.match(index,/id="memberNav"[^>]*hidden/);
 assert.match(index,/id="guestDashboard"/);
 assert.match(index,/\/api\/member\/dashboard/);
 assert.match(index,/\/api\/member\/personnel-list/);
 assert.match(index,/\/api\/callsigns\/self\/status/);
 assert.match(index,/\/discord-status\.html/);
 assert.match(index,/\/vast-roepnummer-aanvragen\.html/);
 assert.match(index,/\/personeelslijst\.html/);
 assert.match(route,/verifiedDiscordIdentity\(decoded,identity\.data\(\)/);
 assert.match(route,/if\(managed\.get\('status'\)==='blocked'\)/);
 assert.match(route,/getAuth\(\)\.verifyIdToken\(token\)/);
 assert.match(route,/app\.get\('\/api\/member\/personnel-list',memberIdentity/);
 assert.match(server,/installMemberDashboardRoutes\(app,\{getSnapshot,accessList\}\)/);
 assert.match(html,/uitsluitend|zonder|Geen toegang|Dossiers/i);
 assert.doesNotMatch(html,/\/api\/personnel\/overview/);
 assert.doesNotMatch(html,/\/api\/basic-observations/);
 assert.doesNotMatch(route,/\.post\(/);
});
test('Dashboard/roster browsercode parses and does not contain new account or dossier mutations',()=>{
 const index=read('public/index.html');
 const html=read('public/personeelslijst.html');
 const inline=index.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 const rosterScript=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline&&rosterScript);
 // Inline ES modules contain top-level await; parse using an async wrapper.
 assert.doesNotThrow(()=>new Script('(async()=>{'+inline+'})()'));
 assert.doesNotThrow(()=>new Script('(async()=>{'+rosterScript+'})()'));
 assert.doesNotMatch(inline,/method:\s*'POST'/);
 assert.doesNotMatch(rosterScript,/method:\s*'POST'/);
});
test('Toegangsvoorbeeld biedt nieuwe leden personeelsinzage zonder observaties',()=>{
 const js=read('public/toegangsvoorbeeld.js');
 assert.match(js,/id:'roster'[^\n]+access:\['full','full','full','full'/);
 assert.match(js,/id:'observaties'[^\n]+access:\['none','none','none','limited'/);
 assert.match(js,/if\(module\.id==='roster'\)return index===0/);
});


test('Mijn profiel toont de eigen vaste-roepnummerstatus zonder tijdelijk dossier',()=>{
 const profile=read('public/discord-status.html');
 assert.match(profile,/id="myCallsign"/);
 assert.match(profile,/id="myCallsignStatus"/);
 assert.match(profile,/href="\/vast-roepnummer-aanvragen\.html"/);
 assert.match(profile,/href="\/personeelslijst\.html"/);
 assert.match(profile,/if\(canSeeOwnLeave\)loadLeave\(\)/);
 assert.match(profile,/\$\('myLeave'\)\.hidden=!canSeeOwnLeave/);
 assert.match(profile,/\/api\/callsigns\/self\/status/);
 assert.doesNotMatch(read('src/member-dashboard-routes.js'),/collection\('bpd_cases'\)/);
});

test('Tijdelijk en vast Agentenkader zien alleen persoonlijk profiel, leesbare lijst en vaste aanvraag',()=>{
 const page=read('public/index.html');
 const preview=read('public/toegangsvoorbeeld.js');
 const api=read('src/member-dashboard-routes.js');
 assert.match(page,/id="memberDashboard" hidden/);
 assert.match(page,/href="\/discord-status\.html"/);
 assert.match(page,/href="\/personeelslijst\.html"/);
 assert.match(page,/href="\/vast-roepnummer-aanvragen\.html"/);
 assert.match(preview,/id:'roster'[^\n]+access:\['full','full','full','full'/);
 assert.match(preview,/id:'observaties'[^\n]+access:\['none','none','none','limited'/);
 assert.match(preview,/id:'verlof'[^\n]+access:\['none','none','none','limited'/);
 assert.match(preview,/if\(module\.id==='home'\)return index===0\|\|order>=3/);
 assert.match(preview,/if\(module\.id==='verlof'\)return order>=3/);
 assert.ok(preview.includes("['nieuw','agent','agentvast'].includes(role.id)"));
 assert.match(api,/if\(!approved && !legacyApproved\)return 'member'/);
 assert.doesNotMatch(api,/collection\('bpd_cases'\)/);
});
