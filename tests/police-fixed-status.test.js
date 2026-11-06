import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixedPoliceStartStatus,activateOnFixedCallLink}
 from '../src/police-fixed-status-policy.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='473163733850390531';
const fixed={dept:'politie',call:'210',discordId:id,status:'In opleiding'};
test('Official fixed Police call activates new linked 2xx-8xx staff exactly once',()=>{
 for(const call of ['200','S210','315','HARTS-01'.replace('HARTS-01','730'),'S-810']){
  const member={...fixed,call};
  assert.equal(fixedPoliceStartStatus(member,{linked:true}),'Actief',call);
  assert.equal(activateOnFixedCallLink(member),'Actief',call);
 }
 for(const call of ['110','930','S150','ABC']){
  assert.equal(fixedPoliceStartStatus({...fixed,call},{linked:true}),'In opleiding');
  assert.equal(activateOnFixedCallLink({...fixed,call}),'In opleiding');
 }
 assert.equal(fixedPoliceStartStatus(fixed,{linked:false}),'In opleiding');
 assert.equal(fixedPoliceStartStatus({...fixed,discordId:''},{linked:true}),'In opleiding');
 assert.equal(fixedPoliceStartStatus({...fixed,dept:'ambulance'},{linked:true}),'In opleiding');
});
test('Manual personnel decisions survive any later fixed-call check',()=>{
 for(const status of ['Actief','50/50','Inactief','Verlof','Afwezig']){
  assert.equal(activateOnFixedCallLink({...fixed,status}),status);
 }
 assert.equal(activateOnFixedCallLink({...fixed,status:'AANGEMELD'}),'AANGEMELD');
});
test('New and pending-to-linked Firestore paths persist ACTIEF with immutable audit',()=>{
 const code=source('src/personnel-editor-routes.js');
 assert.match(code,/const startStatus=fixedPoliceStartStatus\(proposed,\{linked:!pending\}\)/);
 assert.match(code,/status:startStatus,state:pending\?'awaiting_discord':'linked'/);
 assert.match(code,/const nextStatus=activateOnFixedCallLink\(d\)/);
 assert.match(code,/status:nextStatus/);
 assert.match(code,/action:'fixed_callsign_activated'/);
 assert.match(code,/reservePoliceSeriesWithinTransaction/);
 assert.match(code,/INITIAL_POLICE_SPECIALTIES/);
 const sheet=source('src/callsign-utils.js');
 assert.match(sheet,/PolitieInfo!C\$\{plan\.infoRow\}/);
 assert.match(sheet,/\[\['Actief'\]\]/);
});
test('The form previews ACTIEF for linked fixed calls and keeps manual status editing',()=>{
 const html=source('public/personeelsbeheer.html');
 assert.match(html,/id="newStartStatus"/);
 assert.match(html,/function updateNewStartStatus\(\)/);
 assert.match(html,/Actief \(bij vast roepnummer\)/);
 assert.match(html,/updateNewStartStatus\(\)/);
 assert.match(html,/\$\('pStatus'\)\.disabled=!canChangeStatus/);
 assert.match(html,/\$\('editForm'\)\.onsubmit=async/);
});
test('Activity runner sends alerts but never silently changes approved personnel status',()=>{
 const runner=source('src/activity-ping-runner.js');
 assert.match(runner,/No personnel status/);
 assert.match(runner,/geen automatische statuswijziging of ontslag/);
});
