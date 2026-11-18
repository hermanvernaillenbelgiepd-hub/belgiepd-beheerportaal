import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {canManageHistoricalObservationImport,historicalObservationSettings,
 validateHistoricalObservationToggle,historicalObservationAllowed}
 from '../src/historical-observation-import-policy.js';
import {specialFields} from '../src/report-export.js';
import {eligibleRepresentative,representativeFromPersonnel} from '../src/registrations.js';
const officer={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},dossierNativeDepartments:['politie']};
const corps={...officer,role:'korpsleiding',
 departmentRoles:{politie:'korpsleiding'}};
test('uitschakelen historische observatie alleen Officierenkader en Korpsleiding Politie',()=>{
 assert.equal(canManageHistoricalObservationImport(officer),true);
 assert.equal(canManageHistoricalObservationImport(corps),true);
 assert.equal(canManageHistoricalObservationImport({...officer,role:'middenkader',
 departmentRoles:{politie:'middenkader'}}),false);
 assert.equal(canManageHistoricalObservationImport({...officer,departments:['ambulance'],
 departmentRoles:{ambulance:'officierenkader'},dossierNativeDepartments:['ambulance']}),false);
 assert.equal(canManageHistoricalObservationImport({...officer,discordId:'222222222222222222'}),false);
 assert.equal(canManageHistoricalObservationImport({...officer,
 dossierNativeDepartments:[]}),false);
});
test('instelling standaard aan voor oude overname, na uitschakelen ook API-invoer geblokkeerd',()=>{
 assert.deepEqual(historicalObservationSettings(null),{enabled:true,revision:0});
 assert.deepEqual(historicalObservationSettings({enabled:false,revision:2}),
  {enabled:false,revision:2});
 assert.equal(historicalObservationAllowed(officer,'politie','observatie',{enabled:true}),true);
 assert.equal(historicalObservationAllowed(officer,'politie','observatie',{enabled:false}),false);
 assert.equal(historicalObservationAllowed(officer,'politie','sanctie',{enabled:true}),false);
 assert.equal(historicalObservationAllowed(officer,'ambulance','observatie',{enabled:true}),false);
 assert.deepEqual(validateHistoricalObservationToggle({enabled:false,expectedRevision:1,
 reason:'Oude dossiers zijn overgezet'}),{enabled:false,expectedRevision:1,
 reason:'Oude dossiers zijn overgezet'});
 for(const invalid of [
  {enabled:'false',expectedRevision:0,reason:'Alle oude dossiers overgezet'},
  {enabled:false,expectedRevision:-1,reason:'Alle oude dossiers overgezet'},
  {enabled:false,expectedRevision:0,reason:'te kort'},
  {enabled:false,expectedRevision:0,reason:'Veilig overschakelen',privilege:'beheerder'}
 ])assert.throws(()=>validateHistoricalObservationToggle(invalid));
});
test('de server verifieert bevoegdheid en schakelt middels Firestore-transactie met audit',()=>{
 const source=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
 assert.match(source,/app\.put\('\/api\/registrations\/historical-import',requireUser/);
 assert.match(source,/if\(!canManageHistoricalObservationImport\(req\.bpd\)\)/);
 assert.match(source,/validateHistoricalObservationToggle\(req\.body\)/);
 assert.match(source,/runTransaction\(async tx=>/);
 assert.match(source,/HISTORICAL_OBSERVATION_SETTINGS_AUDIT/);
 assert.match(source,/before\.revision!==input\.expectedRevision/);
 assert.match(source,/await historicalSettings\(\)/);
 assert.match(source,/!historicalObservationAllowed\(req\.bpd,dept,type,config\)/);
 assert.match(source,/const represented=representedId\?representativeFromPersonnel/);
 assert.match(source,/submittedByActor:actor/);
 assert.match(source,/historicalImport:Boolean\(represented\)/);
 assert.match(source,/importSource:represented\?'spreadsheet':null/);
 assert.match(source,/historicalObservationImport:importConfig/);
});
test('in het dossier wordt de originele waarnemer gekozen en de invoerder afzonderlijk vermeld',()=>{
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(page,/id="historicalObservationCheck"/);
 assert.match(page,/id="historicalObservationAuthor"/);
 assert.match(page,/id="historicalObservationReason"/);
 assert.match(page,/id="historicalObservationToggle"/);
 assert.match(page,/historicalObservationImport=result\.config/);
 assert.match(page,/data\.onBehalfOfDiscordId=original/);
 assert.match(page,/data\.onBehalfReason=reason/);
 assert.match(page,/Oorspronkelijke observator: /);
 assert.match(page,/Overgenomen uit spreadsheet door /);
 const script=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:script,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
test('historische observaties vermeld in weekrapport ook wie de invoer uitvoerde',()=>{
 const text=specialFields({type:'observatie',score:6,historicalImport:true,
  registeredBy:{name:'Anvar'},onBehalfOf:{name:'Anvar'},
  submittedByActor:{name:'Unemi'},onBehalfReason:'Historische overname uit spreadsheet'});
 assert.ok(text.some(x=>x.includes('Oorspronkelijke observator: Anvar')));
 assert.ok(text.some(x=>x.includes('Handmatig ingevoerd door: Unemi')));
 assert.ok(text.some(x=>x.includes('Historische overname uit spreadsheet')));
});

test('oorspronkelijke observator kan Middenkader, Officierenkader of Korpsleiding zijn',()=>{
 const people=[
  {dept:'politie',personId:'111111111111111111',call:'610',rank:'Hoofdinspecteur',name:'Middenkaderlid'},
  {dept:'politie',personId:'222222222222222222',call:'920',rank:'Aspirant Commissaris',name:'Officier'},
  {dept:'politie',personId:'333333333333333333',call:'910',rank:'Eerste Commissaris',name:'Korpsleiding'},
  {dept:'politie',personId:'444444444444444444',call:'440',rank:'Inspecteur',name:'Basiskaderlid'},
  {dept:'brandweer',personId:'555555555555555555',call:'900',rank:'Commissaris',name:'Andere dienst'}
 ];
 assert.deepEqual(people.map(p=>eligibleRepresentative(p,'politie')),
   [true,true,true,false,false]);
 assert.deepEqual(people.slice(0,3).map(p=>
   representativeFromPersonnel(people,'politie',p.personId)?.name),
  ['Middenkaderlid','Officier','Korpsleiding']);
 assert.equal(representativeFromPersonnel(people,'politie',people[3].personId),null);
 assert.equal(representativeFromPersonnel([...people,people[2]],'politie',people[2].personId),null,
   'Dubbele gekoppelde personeelsfiches blijven verboden');
 const api=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(api,/rank:p\.rank/);
 assert.match(ui,/p\.rank\|\|'Politie'/);
 assert.match(api,/representativeFromPersonnel\(snap\.data,dept,representedId\)/);
 assert.match(api,/submittedByActor:actor/);
});
