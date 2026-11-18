import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLeaveRequest,validateManualLeaveRequest,validateLeaveNote} from '../src/leave-policy.js';
import {canManageHistoricalObservationImport,historicalMigrationSettings,
 validateHistoricalMigrationToggle,historicalMigrationAllowed,
 validateHistoricalActorSelection} from '../src/historical-observation-import-policy.js';
import {specialFields} from '../src/report-export.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const actor={uid:'discord:111111111111111111',discordId:'111111111111111111',
 departments:['politie'],departmentRoles:{politie:'officierenkader'},
 dossierNativeDepartments:['politie']};
test('eigen, verlengd en handmatig verlof kan nooit zonder niet-lege reden worden opgeslagen',()=>{
 for(const note of [undefined,null,'', '  ',42])
   assert.throws(()=>validateLeaveNote(note),/reden/i);
 assert.equal(validateLeaveNote('  Opleiding bij Defensie  '),'Opleiding bij Defensie');
 assert.throws(()=>validateLeaveNote('x'.repeat(301)),/reden/i);
 for(const validator of [validateLeaveRequest,validateManualLeaveRequest]){
   for(const note of [undefined,'','   '])
     assert.throws(()=>validator({startDate:'2026-11-18',endDate:'2026-11-20',note}),/reden/i);
   assert.equal(validator({startDate:'2026-11-18',endDate:'2026-11-20',
     note:'  Tijdelijke afwezigheid  '}).note,'Tijdelijke afwezigheid');
 }
 const routes=read('src/leave-routes.js');
 assert.match(routes,/validateLeaveNote\(body\.note\)/,'verlengingen hebben dezelfde servervalidatie');
 assert.match(routes,/note:typeof record\.note==='string'\?record\.note:''/);
 assert.match(routes,/toReview:review\.map\(d=>item\(d,true\)\)/);
});
test('historische overname is apart, standaard uit en alleen voor geverifieerd kader',()=>{
 assert.deepEqual(historicalMigrationSettings(null),{enabled:false,revision:0});
 assert.deepEqual(historicalMigrationSettings({extendedEnabled:true,extendedRevision:4}),
   {enabled:true,revision:4});
 assert.equal(canManageHistoricalObservationImport(actor),true);
 for(const kind of ['sanctie','notitie','inactiviteitsping','verlof'])
   assert.equal(historicalMigrationAllowed(actor,'politie',kind,{enabled:true}),true,kind);
 assert.equal(historicalMigrationAllowed(actor,'politie','sanctie',{enabled:false}),false);
 assert.equal(historicalMigrationAllowed(actor,'brandweer','sanctie',{enabled:true}),false);
 assert.equal(historicalMigrationAllowed({...actor,uid:'discord:222222222222222222'},
   'politie','sanctie',{enabled:true}),false);
 assert.equal(historicalMigrationAllowed({...actor,departmentRoles:{politie:'middenkader'}},
   'politie','sanctie',{enabled:true}),false);
 assert.deepEqual(validateHistoricalMigrationToggle({
   enabled:true,expectedRevision:0,reason:'Oude dossiergegevens worden overgedragen'}),
   {enabled:true,expectedRevision:0,reason:'Oude dossiergegevens worden overgedragen'});
 assert.throws(()=>validateHistoricalMigrationToggle({
   enabled:true,expectedRevision:0,reason:'te kort'}));
 assert.equal(validateHistoricalActorSelection('222222222222222222',
   'Overgenomen uit de spreadsheet',actor.discordId).actorId,'222222222222222222');
 assert.throws(()=>validateHistoricalActorSelection(actor.discordId,
   'Overgenomen uit de spreadsheet',actor.discordId));
});
test('historische sanctie is geen nieuwe actieve maatregel, historische ping verstuurt niets',()=>{
 const formal=read('src/registration-routes.js');
 assert.match(formal,/app\.put\('\/api\/registrations\/historical-migration'/);
 assert.match(formal,/historicalMigrationSettings\(settings\.data\(\)\)/);
 assert.match(formal,/status:'historisch'/);
 assert.match(formal,/submittedByActor:actor/);
 assert.match(formal,/onBehalfOf:represented\|\|null/);
 const staff=read('src/management-routes.js');
 assert.match(staff,/historicalPing:true/);
 assert.match(staff,/type==='inactiviteitsping'&&!represented/);
 assert.match(staff,/registeredBy:represented\|\|actor,submittedByActor:actor/);
 assert.match(formal,/extendedEnabled:input\.enabled/);
 const leave=read('src/leave-routes.js');
 assert.match(leave,/historicalImport:Boolean\(originalAuthor\)/);
 assert.match(leave,/onBehalfReason,submittedByActor/);
 assert.match(leave,/details\.endDate>=yyyyMmDd\(\)/);
});
test('dd/mm/jjjj en redenen staan op dossier en alle relevante schermen',()=>{
 const html=read('public/personeelsbeheer.html');
 const profile=read('public/discord-status.html');
 const page=read('public/verlofbeheer.html');
 const fire=read('public/brandweerdossier.html');
 const messages=read('public/meldingen.html');
 for(const source of [html,profile,page,fire])
   assert.match(source,/Reden van het verlof \(verplicht/);
 for(const source of [html,profile,page,messages])
   assert.match(source,/displayLeaveDate/);
 assert.match(fire,/formatBelgianLeaveDate/);
 assert.match(html,/Niet geregistreerd \(oude verlofperiode\)/);
 assert.match(html,/historicalMigrationToggle/);
 assert.match(html,/historicalCaseAuthor/);
 assert.match(html,/historicalLeaveAuthor/);
 assert.match(html,/historicalObservationAuthor/);
 assert.match(page,/Reden: /);
 assert.match(messages,/Reden: /);
 const fireApi=read('src/fire-dossier-routes.js');
 assert.match(fireApi,/note:\['full','leadership'\]\.includes\(level\)/);
});
test('de oude overname blijft leesbaar met oorspronkelijke en werkelijke invoerder in weekrapport',()=>{
 const historic=specialFields({type:'notitie',historicalImport:true,
  onBehalfOf:{name:'Originele registrator'},submittedByActor:{name:'Migratiebeheerder'},
  onBehalfReason:'Verwerkt uit historisch archief'});
 assert.ok(historic.some(x=>x.includes('Oorspronkelijke registrator: Originele registrator')));
 assert.ok(historic.some(x=>x.includes('Handmatig ingevoerd door: Migratiebeheerder')));
 assert.ok(historic.some(x=>x.includes('Verwerkt uit historisch archief')));
});
