import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {canManageHistoricalObservationImport,historicalObservationSettings,
 validateHistoricalObservationToggle,historicalObservationAllowed,validateHistoricalActorSelection}
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
 assert.match(source,/!historicalObservationAllowed\(/);
 assert.match(source,/historicalMigrationAllowed\(req\.bpd,dept,type/);
 assert.match(source,/const represented=representedId\?representativeFromPersonnel/);
 assert.match(source,/submittedByActor:actor/);
 assert.match(source,/historicalImport:Boolean\(represented\)/);
 assert.match(source,/importSource:represented\?'spreadsheet':null/);
 assert.match(source,/historicalObservationImport:importConfig/);
});
test('Oorspronkelijke observator mag de actuele, geverifieerde invoerder zelf zijn',()=>{
 const ownId='111111111111111111';
 const reason='Overgenomen uit het vroegere dossier met behoud van originele auteur';
 assert.deepEqual(validateHistoricalActorSelection(ownId,reason,ownId),
  {actorId:ownId,reason});
 assert.throws(()=>validateHistoricalActorSelection('ongeldig',reason,ownId),
  /oorspronkelijke registrator/);
 assert.throws(()=>validateHistoricalActorSelection(ownId,'kort',ownId),
  /bron en reden/);
 const routes=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
 assert.ok(routes.includes('subset.filter(p=>eligibleRepresentative(p,p.dept))'));
 assert.ok(!routes.includes('p.personId!==actor?.discordId'));
});
test('Een eigen historische observatie kan worden opgeslagen zonder de zelfde-ID blokkade',()=>{
 const routes=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
 const ownId='111111111111111111';
 const reason='Oorspronkelijke observatie ingevoerd in de oude spreadsheet';
 assert.deepEqual(validateHistoricalActorSelection(ownId,reason,ownId),{
   actorId:ownId,reason
 });
 assert.match(routes,/if\(representedId && !represented\)/,
   'Alleen een ongeldige of ontbrekende oorspronkelijke observator wordt geweigerd');
 assert.doesNotMatch(routes,/representedId\s*===\s*actor\.discordId/,
   'De eigenaar van de oorspronkelijke registratie mag ook de huidige invoerder zijn');
 assert.match(routes,/const represented=representedId\?representativeFromPersonnel\(snap\.data,dept,representedId\):null/);
 assert.match(routes,/registeredBy:represented\|\|actor,submittedByActor:actor/);
 assert.match(routes,/historicalImport:Boolean\(represented\),importSource:represented\?'spreadsheet':null/);
 // Eigen dossierregistraties blijven afzonderlijk beschermd.
 assert.match(routes,/verifiedBoardCorpsDossierAdmin\(req\.bpd\)&&id===req\.bpd\.discordId/);
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

test('historische verlofovername heeft een bereikbare schakelaar en preflight, zonder rechten te verruimen',()=>{
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
 assert.match(page,/\.after\(\$\('historicalMigrationManage'\)\)/,
   'Migratieschakelaar staat in de registratiehub, niet verborgen in het sanctieformulier');
 assert.match(page,/id="historicalLeaveAvailability"/);
 assert.match(page,/migrationKinds=\['leave','sanctie'/);
 assert.match(page,/async function verifyHistoricalLeaveTransfer\(transfer,dossierKey\)/);
 assert.match(page,/if\(!transfer\.onBehalfOfDiscordId\)return/);
 assert.match(page,/await request\('\/api\/registrations\/subjects'\)/);
 assert.match(page,/fresh\?\.historicalMigration\?\.enabled!==true/);
 assert.match(page,/const historical=historicalTransferData\('historicalLeave'\)/);
 assert.match(page,/await verifyHistoricalLeaveTransfer\(historical,dossierKey\)/);
 assert.match(page,/note:\$\('leaveNote'\)\.value\.trim\(\),\.\.\.historical/);
 assert.doesNotMatch(page,/\.\.\.historicalTransferData\('historicalLeave'\)\}\}/,
   'Overnamegegevens worden eerst expliciet gevalideerd');
 assert.match(server,/historicalMigrationAllowed\(req\.bpd,dept,'verlof'/,
   'De bestaande servertoegangscontrole blijft ongewijzigd');
});
