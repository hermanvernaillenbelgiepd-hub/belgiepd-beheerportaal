import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {lifecycleKey,validateLifecycleAction,lifecycleSourceSnapshot,
 overlayPersonnelLifecycle,possibleDiscordDepartures,validateHonorableRequest,
 validateHonorableDecision,HONORABLE_REENTRY_REQUIRES} from '../src/personnel-lifecycle-policy.js';
const id='123456789012345678',other='123456789012345679';
const row=(dept='politie')=>({dept,personId:id,name:'Test Agent',
 call:'485',rank:'Inspecteur',status:'Actief',hours:9,totalHours:120,
 specialties:[{label:'RAGO',value:'Ja',source:'discord-verified'}]});
const archived=(dept='politie')=>({
 dept,discordId:id,state:'archived',revision:2,cause:'voluntary_discord_leave',
 snapshot:lifecycleSourceSnapshot(row(dept))
});
test('lifecycle only accepts exact, qualified departmental Discord IDs',()=>{
 assert.equal(lifecycleKey('politie',id),'politie_'+id);
 assert.equal(lifecycleKey('burger',id),'burger_'+id);
 assert.equal(lifecycleKey('politie','not-a-snowflake'),null);
});
test('outdienst registration validates cause and revision; restoration has no invented cause',()=>{
 assert.deepEqual(validateLifecycleAction({
 reason:'Vrijwillig vertrokken uit de Discord-server',cause:'voluntary_discord_leave',expectedRevision:0
 },'archive'),{reason:'Vrijwillig vertrokken uit de Discord-server',
 cause:'voluntary_discord_leave',expectedRevision:0});
 assert.throws(()=>validateLifecycleAction({reason:'te kort',cause:'management_dismissal',expectedRevision:0},'archive'));
 assert.throws(()=>validateLifecycleAction({reason:'Verkeerde statuswijziging',cause:'role_guess',expectedRevision:0},'archive'));
 assert.throws(()=>validateLifecycleAction({reason:'Herintreding toegestaan',expectedRevision:-1},'restore'));
 assert.equal(validateLifecycleAction({reason:'Herintreding geautoriseerd',expectedRevision:2},'restore').cause,'return_to_service');
});
test('archival suppresses only one service; underlying roster and audit evidence stay unchanged',()=>{
 const police=row(),fire=row('brandweer'),docs=[archived()];
 const current=overlayPersonnelLifecycle([police,fire],docs);
 assert.equal(current.length,1);assert.equal(current[0].dept,'brandweer');
 assert.equal(police.status,'Actief');assert.equal(police.totalHours,120);
 const historical=overlayPersonnelLifecycle([police,fire],docs,{includeArchived:true});
 assert.equal(historical.length,2);assert.equal(historical[0].lifecycleState,'archived');
});
test('restoration resurrects an explicit archived snapshot when spreadsheet row no longer exists',()=>{
 const prior=archived();
 assert.equal(overlayPersonnelLifecycle([], [prior]).length,0);
 const read=overlayPersonnelLifecycle([], [prior],{includeArchived:true});
 assert.equal(read.length,1);
 assert.equal(read[0].totalHours,120);
 assert.equal(read[0].personId,id);
 const restored={...prior,state:'active',cause:'return_to_service',revision:3,restoreFromArchive:true};
 const active=overlayPersonnelLifecycle([], [restored]);
 assert.equal(active.length,1);
 assert.equal(active[0].name,'Test Agent');
 assert.equal(active[0].lifecycleState,'active');
});
test('reentry stays out of active lists and has no cadre access until CMS review',()=>{
 const prior=archived();
 const pending={...prior,state:'pending',revision:3,cmsRoleSyncPending:true,
  restoreFromArchive:true};
 assert.equal(overlayPersonnelLifecycle([row()], [pending]).length,0);
 assert.equal(overlayPersonnelLifecycle([], [pending]).length,0);
 const review=overlayPersonnelLifecycle([], [pending],{includeArchived:true});
 assert.equal(review.length,1);
 assert.equal(review[0].lifecycleState,'pending');
 const active={...pending,state:'active',cmsRoleSyncPending:false,revision:4};
 assert.equal(overlayPersonnelLifecycle([], [active]).length,1);
});
test('server parses archive JSON and filters pending service access',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes("app.use('/api/personnel-lifecycle',express.json"));
 assert.ok(server.includes("['archived','pending'].includes(lifecycle.get('state'))"));
 const routes=readFileSync(new URL('../src/personnel-lifecycle-routes.js',import.meta.url),'utf8');
 assert.ok(routes.includes("for(const action of ['archive','restore','activate'])"));
});
test('duplicate or malformed ledger records cannot silently hide staff',()=>{
 const p=row();
 assert.equal(overlayPersonnelLifecycle([p],[{...archived(),id:'politie_'+other}])[0],p);
 assert.equal(overlayPersonnelLifecycle([p],[{...archived(),state:'unknown'}])[0],p);
});
test('missing Discord membership is a read-only candidate, never an automatic dismissal',()=>{
 const input=[row(),row('ambulance')];
 assert.deepEqual(possibleDiscordDepartures(input,{status:'unavailable',entries:new Map()}),[]);
 const missing=possibleDiscordDepartures(input,{status:'ok',entries:new Map()});
 assert.equal(missing.length,2);
 assert.ok(missing.every(x=>x.evidence==='not_in_successful_api_snapshot'));
 assert.equal(input[0].status,'Actief');
 const roleMissing=possibleDiscordDepartures(input,{status:'ok',entries:new Map([[id,[]]])});
 assert.equal(roleMissing.length,2);
 assert.ok(roleMissing.every(x=>x.evidence==='service_roles_missing_in_verified_snapshot'));
 const policeOnly=possibleDiscordDepartures(input,{
  status:'ok',entries:new Map([[id,['1309532438053130326']]])
 });
 assert.equal(policeOnly.length,1);
 assert.equal(policeOnly[0].dept,'ambulance');
});
test('personnel administration UI has syntactically valid inline Javascript',()=>{
 const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const start=html.indexOf('<script type="module">');
 const end=html.indexOf('</script><script defer',start);
 assert.ok(start>0&&end>start,'Expected management inline module');
 const module=html.slice(start+'<script type="module">'.length,end);
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],
  {input:module,encoding:'utf8',timeout:10000});
 assert.equal(checked.status,0,checked.stderr);
 assert.match(html,/id="personnelArchivePanel"/);
 assert.match(html,/id="personnelArchiveAction"/);
});

test('eervol ontslag is een aanvraag met onafhankelijke goedkeuring, niet een directe zelf-archivering',()=>{
 assert.deepEqual(validateHonorableRequest({
  department:'politie',reason:'Ik vraag eervol ontslag wegens een loopbaanonderbreking'
 }),{department:'politie',reason:'Ik vraag eervol ontslag wegens een loopbaanonderbreking'});
 assert.throws(()=>validateHonorableRequest({department:'brandweer',reason:'Eervol ontslag aanvragen'}));
 assert.deepEqual(validateHonorableDecision({
  decision:'approve',reason:'Gecontroleerd en akkoord door Korpsleiding'
 }),{decision:'approve',reason:'Gecontroleerd en akkoord door Korpsleiding'});
 assert.throws(()=>validateHonorableDecision({decision:'approve',reason:'nee'}));
 assert.equal(HONORABLE_REENTRY_REQUIRES.entryRank,'Inspecteur');
 assert.equal(HONORABLE_REENTRY_REQUIRES.trainingHistoryPreserved,true);
 assert.equal(HONORABLE_REENTRY_REQUIRES.decorationsPreserved,true);
 assert.equal(HONORABLE_REENTRY_REQUIRES.automaticOperationalPrivileges,false);
});
