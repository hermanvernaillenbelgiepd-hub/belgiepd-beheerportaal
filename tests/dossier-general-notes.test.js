import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {MANAGEMENT_TYPES,RECORD_LABELS,mayWriteManagement,mayCorrectManualCase,
 validateManagementEntry,reportSections} from '../src/management-utils.js';
import {historicalMigrationAllowed} from '../src/historical-observation-import-policy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const actor={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'officierenkader',departments:['politie'],departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const subject={personId:'222222222222222222',dept:'politie',
 call:'434',rank:'Inspecteur van politie'};

test('algemene notitie is eigen gevalideerde dossierregistratie en geen belangrijke notitie',()=>{
 assert.ok(MANAGEMENT_TYPES.includes('algemene_notitie'));
 assert.equal(RECORD_LABELS.algemene_notitie,'Algemene notitie');
 assert.equal(mayWriteManagement(actor,'politie','algemene_notitie'),true);
 const raw={type:'algemene_notitie',eventDate:'2026-11-18',
   details:'Algemene opvolging en overdracht binnen het personeelsdossier'};
 const valid=validateManagementEntry(raw);
 assert.equal(valid.type,'algemene_notitie');
 assert.equal(valid.details,raw.details);
 assert.equal(valid.reportCategory,'algemene_notitie');
 assert.throws(()=>validateManagementEntry({...raw,details:'   '}),/Omschrijving/);
 const report=reportSections([{...valid,subjectCallAtCreation:'434'}],
  '2026-11-01','2026-11-30');
 assert.equal(report.find(x=>x.type==='algemene_notitie').entries.length,1);
 assert.equal(report.find(x=>x.type==='notitie').entries.length,0);
});

test('de bestaande bevoegdheden beschermen gewone notities, ook bij correcties en historisch invoeren',()=>{
 const mk={...actor,role:'middenkader',departmentRoles:{politie:'middenkader'}};
 assert.equal(mayWriteManagement(mk,'politie','algemene_notitie'),true);
 assert.equal(mayWriteManagement({...actor,departments:[],dossierAllowedDepartments:[]},
  'politie','algemene_notitie'),false);
 const original={type:'algemene_notitie',dept:'politie',subjectDiscordId:subject.personId,
  registeredBy:{discordId:'333333333333333333',name:'Lid MK',call:'700'}};
 assert.equal(mayCorrectManualCase(actor,subject,original),true);
 assert.equal(mayCorrectManualCase(mk,subject,original),false);
 assert.equal(historicalMigrationAllowed(actor,'politie','algemene_notitie',{enabled:true}),true);
 assert.equal(historicalMigrationAllowed(actor,'politie','algemene_notitie',{enabled:false}),false);
 assert.equal(historicalMigrationAllowed(mk,'politie','algemene_notitie',{enabled:true}),false);
});

test('nieuwe notities en legacy-basisnotities hebben aparte dossierweergave zonder duplicaat van belangrijke notities',()=>{
 const html=read('public/personeelsbeheer.html');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const checked=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:script,encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);
 for(const string of ["notities:'Notities'",'id="sheetBasisNotes"',
  "['case:algemene_notitie','Algemene notitie']",
  "type==='algemene_notitie'","renderGeneralDossierNotes()",
  "generalLegacyEntries=basis.map","generalCaseEntries=cases.filter",
  "sheetSetRows('basisNotes',list","panes.notities.append",
  "generalNoteAdd.onclick=()=>choosePersonnelRegistration('case:algemene_notitie',true)",
  "addNote.hidden=!kinds.some(([key])=>key==='case:algemene_notitie')",
  "body.textContent=row.details||'—'","item.append(heading,body,meta)"])
  assert.ok(html.includes(string),string);
 assert.match(html,/importantCaseEntries=cases\.filter\(x=>\['notitie','specialisatiebeperking'/);
 assert.ok(!html.includes("importantCaseEntries=cases.filter(x=>['algemene_notitie'"));
 assert.match(html,/row\._dossierSource==='cases'\?'cases':'staff'/);
 assert.match(html,/String\(b\._noteSortDate\|\|''\)\.localeCompare/);
});

test('notities mogen uitsluitend via bestaande server-API en auditlog worden opgeslagen',()=>{
 const server=read('src/management-routes.js');
 assert.match(server,/app.post\('\/api\/management\/cases',requireUser/);
 assert.match(server,/mayWriteManagement\(req\.bpd,dept,type\)/);
 assert.match(server,/validateManagementEntry\(req\.body\)/);
 assert.match(server,/createdAt:FieldValue\.serverTimestamp\(\)/);
 assert.doesNotMatch(read('public/personeelsbeheer.html'),/\.innerHTML\s*=/);
});
