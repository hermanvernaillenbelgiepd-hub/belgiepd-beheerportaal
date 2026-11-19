import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nextPromotionRank,recommendedPromotionCall,validatePromotionDecision}
 from '../src/police-promotion-routes.js';
import {automaticPoliceSpecialties} from '../src/specialization-policy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('a promotion recommends the immediate next police grade',()=>{
 assert.equal(nextPromotionRank('Aspirant Inspecteur'),'Inspecteur');
 assert.equal(nextPromotionRank('Inspecteur'),'Eerste Inspecteur');
 assert.equal(nextPromotionRank('Eerste Hoofdinspecteur'),'Aspirant Commissaris');
 assert.equal(nextPromotionRank('Aspirant Commissaris'),null);
 assert.equal(nextPromotionRank('Onbekend'),null);
});
test('the suggestion chooses a grade-compatible free callsign without reserving it',()=>{
 assert.equal(recommendedPromotionCall('Inspecteur',new Set()),400);
 assert.equal(recommendedPromotionCall('Inspecteur',new Set([400,410,420])),430);
 assert.equal(recommendedPromotionCall('Aspirant Inspecteur',new Set([300,310])),320);
 assert.equal(recommendedPromotionCall('Hoofdinspecteur',new Set([700])),710);
 assert.equal(recommendedPromotionCall('Inspecteur',new Set(
  Array.from({length:100},(_,i)=>400+i))),null);
});
test('approval cannot use a callsign from the wrong grade or 900/910',()=>{
 assert.deepEqual(validatePromotionDecision({
  decision:'approve',newRank:'Inspecteur',newCall:'400',
  reason:'Goedgekeurd na grondige beoordeling van het voorstel'
 }),{decision:'approve',newRank:'Inspecteur',newCall:'400',number:400,
  reason:'Goedgekeurd na grondige beoordeling van het voorstel'});
 assert.throws(()=>validatePromotionDecision({decision:'approve',
  newRank:'Inspecteur',newCall:'500',
  reason:'Goedgekeurd na grondige beoordeling van het voorstel'}),/bijpassend/);
 assert.throws(()=>validatePromotionDecision({decision:'approve',
  newRank:'Aspirant Commissaris',newCall:'900',
  reason:'Goedgekeurd na grondige beoordeling van het voorstel'}),/bijpassend/);
 assert.equal(validatePromotionDecision({decision:'reject',
  reason:'Afgewezen na zorgvuldige beoordeling van het personeelsdossier'}).decision,'reject');
});
test('an Inspector automatically gets Semi-ano. from callsign unless a manual restriction overrides',()=>{
 const base={dept:'politie',call:'400'};
 assert.equal(automaticPoliceSpecialties({...base,call:'316'})['Semi-ano.'],undefined);
 assert.equal(automaticPoliceSpecialties(base)['Semi-ano.'],'Ja');
 const policy=read('src/specialization-policy.js');
 assert.match(policy,/savedManual\(saved\)\?saved/);
 assert.match(policy,/\.\.\.\(call>=400\?\{'Semi-ano\.':'Ja'\}/);
});
test('police proposal submission, audit and approval are linked by the SAME original entry',()=>{
 const manager=read('src/management-routes.js');
 const approval=read('src/police-promotion-routes.js');
 assert.match(manager,/proposalStatus:'pending'/);
 assert.match(manager,/POLICE_PROMOTION_PROPOSALS/);
 assert.match(approval,/const caseRef=caseRoot\.collection\('entries'\)\.doc\(id\)/);
 assert.match(approval,/tx\.update\(caseRef,\{proposalStatus:status/);
 assert.match(approval,/source:'approved-promotion-proposal'/);
 assert.match(approval,/tx\.set\(editRef,\{dept:'politie'/);
 assert.match(approval,/oldClaim\.id!==newClaim\.id/);
 assert.match(approval,/approvedRankEdit:true/);
 assert.match(approval,/canChangePoliceGrade\(req\.bpd,person\)/);
 assert.match(approval,/current\.get\('status'\)!=='pending'/);
 assert.match(approval,/newHold\?\.exists/);
 assert.match(approval,/!allowed\.includes\(input\.newRank\)/);
 assert.doesNotMatch(approval,/discordRolesChanged:true/);
});
test('manual decision is effective by default, historical import remains explicitly selectable',()=>{
 const p=read('public/personeelsbeheer.html');
 assert.match(p,/<option value="effective">Nieuwe beslissing/);
 assert.match(p,/\$\('staffMovementMode'\)\.value='effective'/);
 assert.match(p,/\$\('staffMovementMode'\)\.value==='effective'/);
 assert.match(p,/\/api\/personnel\/politie\/.*rank-change/);
 assert.match(p,/\/api\/police-promotions\/suggestion/);
});
test('notifications has the actionable approvals and role selection',()=>{
 const html=read('public/meldingen.html');
 assert.match(html,/id="policePromotionPanel"/);
 assert.match(html,/loadPolicePromotions/);
 assert.match(html,/Promotie goedkeuren/);
 assert.match(html,/Voorstel afwijzen/);
 assert.match(html,/\/api\/police-promotions\/pending/);
 assert.match(html,/\/api\/police-promotions\/.*\/decision/);
 const start=html.indexOf('<script type="module">');
 const end=html.indexOf('</script><script defer',start);
 assert.ok(start>0&&end>start,'Expected module script in notifications');
 const script=html.slice(start+'<script type="module">'.length,end);
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],{
  input:script,encoding:'utf8',timeout:10000});
 assert.equal(checked.status,0,checked.stderr);
});

test('a new effective movement never silently skips next-free number suggestion',()=>{
 const ui=read('public/personeelsbeheer.html');
 const start=ui.indexOf('async function suggestPromotionCall(');
 const end=ui.indexOf("$('staffMovementNewRank').addEventListener",start);
 assert.ok(start>0&&end>start);
 const suggestion=ui.slice(start,end);
 assert.doesNotMatch(suggestion,/person\.canChangeRank\s*!==\s*true/);
 assert.match(suggestion,/\/api\/police-promotions\/suggestion/);
 assert.match(suggestion,/result\.call===null/);
 assert.match(suggestion,/field\.value=String\(result\.call\)/);
 assert.match(suggestion,/Automatisch voorstellen mislukt/);
 assert.match(ui,/id="staffMovementCallSuggestion"/);
 assert.match(ui,/id="staffMovementCallRefresh"/);
 assert.match(ui,/Voorgesteld vrij roepnummer/);
 assert.match(ui,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 const route=read('src/police-promotion-routes.js');
 assert.match(route,/mayWriteManagement\(req\.bpd,'politie','personeelsbeweging'\)/);
 assert.match(route,/canReadPersonnelSubject\(req\.bpd,person\)/);
 assert.match(route,/const maySuggest=canChangePoliceGrade/);
});
