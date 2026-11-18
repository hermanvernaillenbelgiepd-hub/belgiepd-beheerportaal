import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateHonorableRequest,validateHonorableDecision,
 HONORABLE_REENTRY_REQUIRES} from '../src/personnel-lifecycle-policy.js';
import {mayWriteManagement,validateManagementEntry,RECORD_LABELS}
 from '../src/management-utils.js';
const src=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const officer={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
test('voordracht is separate registration and not an automatic decoration',()=>{
 assert.equal(RECORD_LABELS.voordracht_ereteken,'Voordracht tot ereteken/medaille');
 assert.equal(mayWriteManagement(officer,'politie','voordracht_ereteken'),true);
 assert.equal(mayWriteManagement(officer,'ambulance','voordracht_ereteken'),false);
 const mk={...officer,role:'middenkader',departmentRoles:{politie:'middenkader'}};
 assert.equal(mayWriteManagement(mk,'politie','voordracht_ereteken'),true);
 const item=validateManagementEntry({type:'voordracht_ereteken',eventDate:'2026-11-18',
  details:'Voordracht wegens buitengewone professionele inzet.'});
 assert.equal(item.type,'voordracht_ereteken');
 assert.equal(item.reportCategory,'voordracht_ereteken');
 assert.equal(item.catalogId,undefined);
});
test('eervol ontslag vergt eigen aanvraag, onafhankelijke beslissing en behoud',()=>{
 assert.equal(validateHonorableRequest({department:'politie',
  reason:'Aanvraag wegens loopbaanonderbreking'}).department,'politie');
 assert.throws(()=>validateHonorableRequest({department:'ambulance',
  reason:'Aanvraag wegens loopbaanonderbreking'}));
 assert.equal(validateHonorableDecision({decision:'approve',
  reason:'Onafhankelijk akkoord door leiding'}).decision,'approve');
 assert.equal(HONORABLE_REENTRY_REQUIRES.trainingHistoryPreserved,true);
 assert.equal(HONORABLE_REENTRY_REQUIRES.decorationsPreserved,true);
 assert.equal(HONORABLE_REENTRY_REQUIRES.automaticOperationalPrivileges,false);
 const api=src('src/personnel-lifecycle-routes.js');
 assert.match(api,/app\.post\('\/api\/personnel-lifecycle\/honorable\/request',requireUser/);
 assert.match(api,/app\.post\('\/api\/personnel-lifecycle\/honorable\/:discordId\/decision',requireUser/);
 assert.match(api,/if\(!allowed\(req\.bpd,person\)\)/);
 assert.match(api,/if\(request\.get\('status'\)!=='pending'\)/);
 assert.match(api,/if\(approved\)invalidateLifecycle\(\)/);
 assert.match(api,/cause:'honorable_resignation'/);
 assert.match(api,/cmsRoleSyncPending:true/);
 assert.match(api,/honorableResignation:true/);
 assert.match(api,/if\(action==='activate'&&prev\.honorableResignation===true\)/);
 assert.doesNotMatch(api,/tx\.delete\(.*bpd_/);
});
test('900 and 910 own notes cannot open general protected dossiers',()=>{
 const api=src('src/management-routes.js');
 const markup=src('public/discord-status.html');
 assert.match(api,/canReadPersonnelSubject\(req\.bpd,subject\)/);
 assert.match(api,/app\.post\('\/api\/management\/corps-note\/me',requireUser/);
 assert.match(api,/actor\?\.role!=='korpsleiding'/);
 assert.match(api,/actor\?\.uid!=='discord:'\+id/);
 assert.match(api,/\(900\|910\)/);
 assert.match(api,/ownCorpsNote:true/);
 assert.match(markup,/id="ownCorpsNotesForm"/);
 assert.match(markup,/id="honorableForm"/);
});
test('rollout personnel management UI stays valid ES module',()=>{
 const html=src('public/personeelsbeheer.html');
 const start=html.indexOf('<script type="module">');
 const end=html.indexOf('</script><script defer',start);
 assert.ok(start>0&&end>start);
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],{
  input:html.slice(start+'<script type="module">'.length,end),encoding:'utf8',timeout:10000
 });
 assert.equal(checked.status,0,checked.stderr);
});

test('voordrachten hebben afzonderlijk beveiligd overzicht en expliciete beslissing',()=>{
 const api=src('src/management-routes.js');
 const ui=src('public/personeelsbeheer.html');
 assert.match(api,/app\.get\('\/api\/management\/award-nominations',requireUser/);
 assert.match(api,/app\.post\('\/api\/management\/award-nominations\/decision',requireUser/);
 assert.match(api,/mayReviewNominations\(req\.bpd\)/);
 assert.match(api,/canReadPersonnelSubject\(req\.bpd,subject\)/);
 assert.match(api,/nominationStatus:decision==='approve'\?'approved':'rejected'/);
 assert.match(api,/medalAwarded:false/);
 assert.match(ui,/id="refreshNominations"/);
 assert.match(ui,/id="nominationEntries"/);
});
