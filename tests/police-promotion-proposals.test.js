import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nextPromotionRank,recommendedPromotionCall,validatePromotionDecision}
 from '../src/police-promotion-routes.js';
import {automaticPoliceSpecialties} from '../src/specialization-policy.js';
import {policeSubjectGradeOption,POLICE_RANK_CHOICES,
  allowedPoliceGradeChoices,canChangePoliceGrade} from '../src/personnel-rank-policy.js';
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

test('degradation to Agent proposes the next free permanent 2xx callsign',()=>{
 assert.equal(recommendedPromotionCall('Agent',new Set()),200);
 assert.equal(recommendedPromotionCall('Agent',new Set([200])),210);
 assert.equal(recommendedPromotionCall('Agent',new Set(
   Array.from({length:10},(_,i)=>200+10*i))),205);
 assert.equal(recommendedPromotionCall('Agent',new Set(
   [...Array.from({length:10},(_,i)=>200+10*i),
    ...Array.from({length:10},(_,i)=>205+10*i)])),201);
 assert.equal(recommendedPromotionCall('Agent',new Set(
   Array.from({length:100},(_,i)=>200+i))),null);
 // Temporary 1xx numbers must never be suggested for effective demotion.
 assert.equal(recommendedPromotionCall('Agent',new Set(
   Array.from({length:100},(_,i)=>200+i))),null);
});
test('the manual effective movement recommends an adjacent grade in either direction',()=>{
 const ui=read('public/personeelsbeheer.html');
 assert.match(ui,/const proposedIndex=kind==='Promotie'\?idx\+1:idx-1/);
 assert.match(ui,/\$\('staffMovement'\)\.onchange=\(\)=>\{/);
 assert.match(ui,/\$\('staffMovementNewCall'\)\.value='';\s*updateStaffMovementFields\(\)/);
 assert.match(ui,/tientallen, vijftallen, daarna overige nummers/);
 const route=read('src/police-promotion-routes.js');
 assert.match(route,/const hundreds=rank==='Agent'\?\[2\]:option\.hundreds/);
 assert.match(route,/wanted\.grade===current\.grade/);
 assert.doesNotMatch(route,/wanted\.grade<=current\.grade/);
});

test('3xx police personnel with a legacy long rank name can propose a 4xx promotion',()=>{
 const person={dept:'politie',rank:'Aspirant Inspecteur van Politie (A-INP)',call:'316'};
 const current=policeSubjectGradeOption(person);
 assert.equal(current?.grade,1);
 assert.equal(current?.rank,'Aspirant Inspecteur');
 assert.equal(nextPromotionRank(current.rank),'Inspecteur');
 assert.equal(recommendedPromotionCall('Inspecteur',new Set()),400);
 assert.equal(policeSubjectGradeOption({...person,rank:'Inspecteur'}),null,
   'A canonical rank conflicting with the official callsign must fail closed');
 assert.equal(policeSubjectGradeOption({...person,call:'900'}),null,
   'Protected 900 is not a valid promotion source');
 const officer={uid:'discord:111111111111111111',discordId:'111111111111111111',
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},discordPoliceRank:'officierenkader'};
 assert.ok(allowedPoliceGradeChoices(officer).includes('Inspecteur'));
 assert.ok(!allowedPoliceGradeChoices(officer).includes('Aspirant Commissaris'));
 assert.equal(POLICE_RANK_CHOICES[1].rank,'Aspirant Inspecteur');
});
test('legacy-grade normalization is shared by proposals, previews and approvals',()=>{
 const policy=read('src/personnel-rank-policy.js');
 const manager=read('src/management-routes.js');
 const routes=read('src/police-promotion-routes.js');
 assert.match(policy,/export function policeSubjectGradeOption/);
 assert.match(manager,/const currentPoliceGrade=proposalType\?policeSubjectGradeOption\(subject\):null/);
 assert.match(routes,/const current=policeSubjectGradeOption\(person\),wanted=policeRankByName\(rank\)/);
 assert.match(routes,/const before=policeSubjectGradeOption\(person\),after=policeRankByName\(input\.newRank\)/);
 const ui=read('public/personeelsbeheer.html');
 assert.match(ui,/function currentPoliceGradeIndex\(person\)/);
 assert.match(ui,/const idx=currentPoliceGradeIndex\(selected\)/);
 assert.match(ui,/const before=currentPoliceGradeIndex\(person\),after=rankChoices\.indexOf\(newRank\)/);
 const names=['Agent','Aspirant Inspecteur','Inspecteur','Eerste Inspecteur',
  'Aspirant Hoofdinspecteur','Hoofdinspecteur','Eerste Hoofdinspecteur'];
 const start=ui.indexOf('function currentPoliceGradeIndex(person)');
 const end=ui.indexOf('function updateStaffCaseFields(){',start);
 assert.ok(start>0&&end>start);
 const lookup=Function('rankChoices',ui.slice(start,end)+';return currentPoliceGradeIndex;')(names);
 assert.equal(lookup({dept:'politie',rank:'Aspirant Inspecteur van Politie (A-INP)',call:'316'}),1);
 assert.equal(names[lookup({dept:'politie',rank:'Aspirant Inspecteur van Politie (A-INP)',call:'316'})+1],'Inspecteur');
 assert.equal(lookup({dept:'politie',rank:'Aspirant Inspecteur van Politie (A-INP)',call:'900'}),-1);
});

test('verified Police Officierenkader can process a lower-rank 316 movement',()=>{
 const officerId='111111111111111111';
 const officer={uid:'discord:'+officerId,discordId:officerId,
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},
  dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie'],
  discordPoliceRank:'officierenkader'};
 const subject={dept:'politie',personId:'222222222222222222',
  rank:'Aspirant Inspecteur van Politie (A-INP)',call:'316'};
 assert.equal(canChangePoliceGrade(officer,subject),true);
 assert.equal(allowedPoliceGradeChoices(officer).includes('Inspecteur'),true);
 const insufficient={...officer,discordPoliceRank:null};
 assert.equal(canChangePoliceGrade(insufficient,subject),false,
  'A saved portal role alone is insufficient without Discord verification');
 const self={...subject,personId:officerId};
 assert.equal(canChangePoliceGrade(officer,self),false);
});

test('effective promotion submits to server even if an overview permission flag was stale',()=>{
 const ui=read('public/personeelsbeheer.html');
 const from=ui.indexOf("$('staffCaseForm').onsubmit=async event=>");
 const until=ui.indexOf("$('staffCaseForm').",from+35);
 const flow=ui.slice(from,until>from?until:from+11000);
 assert.ok(flow.includes("await request('/api/personnel/politie/'"));
 assert.doesNotMatch(flow,/person\.canChangeRank\s*!==\s*true/);
 assert.match(flow,/if\(person\.dept!=='politie'\|\|!rankChangesEnabled\)/);
});
test('a technically switched operational Police leader retains only independently verified rank power',async()=>{
 const {canChangePoliceGrade,allowedPoliceGradeChoices,verifiedPoliceRankAuthority}=
   await import('../src/personnel-rank-policy.js');
 const person={dept:'politie',personId:'222222222222222222',
   call:'316',rank:'Aspirant Inspecteur van Politie (A-INP)'};
 const source={uid:'discord:111111111111111111',
   discordId:'111111111111111111',role:'beheerder',
   operationalRole:'korpsleiding',
   departments:['politie'],departmentRoles:{politie:'korpsleiding'},
   operationalDepartmentRoles:{politie:'korpsleiding'},
   portalTechnicalMode:true,profileTechnicalAvailable:true,
   dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie'],
   discordPoliceRank:'korpsleiding',boardPersonnelAdmin:true};
 assert.equal(verifiedPoliceRankAuthority(source),'korpsleiding');
 assert.equal(canChangePoliceGrade(source,person),true);
 assert.ok(allowedPoliceGradeChoices(source).includes('Aspirant Commissaris'));
 assert.equal(canChangePoliceGrade({...source,discordPoliceRank:null},person),false);
 assert.equal(canChangePoliceGrade({...source,operationalRole:'beheerder'},person),false);
 assert.equal(canChangePoliceGrade({...source,profileTechnicalAvailable:false},person),false);
 const officer={...source,operationalRole:'officierenkader',
   operationalDepartmentRoles:{politie:'officierenkader'},
   discordPoliceRank:'officierenkader'};
 assert.equal(canChangePoliceGrade(officer,person),true);
 assert.ok(!allowedPoliceGradeChoices(officer).includes('Aspirant Commissaris'));
 assert.equal(canChangePoliceGrade({...source,discordId:person.personId,
   uid:'discord:'+person.personId},person),false);
});
