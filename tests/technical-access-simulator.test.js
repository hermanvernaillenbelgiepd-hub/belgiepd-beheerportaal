import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCENARIOS,technicalSimulatorOnlyTest,
 canRunTechnicalSimulator,simulateTechnicalRights} from '../src/technical-access-simulator.js';
const testEnv={RENDER_SERVICE_ID:'srv-dbampoqjnfac738b1tsg'};
const mainEnv={RENDER_SERVICE_ID:'srv-dbaj7njbc2fs73bjt4fg'};
const admin={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'beheerder',portalTechnicalMode:true,profileTechnicalAvailable:true};
test('technische simulatie is 403 voor elke niet-technische rol en ontbreekt op MAIN',()=>{
 assert.equal(technicalSimulatorOnlyTest(testEnv),true);
 assert.equal(technicalSimulatorOnlyTest(mainEnv),false);
 assert.equal(canRunTechnicalSimulator(admin,testEnv),true);
 assert.equal(canRunTechnicalSimulator(admin,mainEnv),false);
 assert.equal(canRunTechnicalSimulator({...admin,portalTechnicalMode:false},testEnv),false);
 assert.equal(canRunTechnicalSimulator({...admin,role:'korpsleiding'},testEnv),false);
 assert.equal(canRunTechnicalSimulator({...admin,uid:'discord:222222222222222222'},testEnv),false);
});
test('fictieve leidinggevende functies tonen dienstgebonden matrix zonder toegangsverhoging',()=>{
 assert.ok(SCENARIOS.length>=10);
 assert.equal(simulateTechnicalRights('police_basic').checks.personeelsficheWijzigen,false);
 const mk=simulateTechnicalRights('police_middle');
 assert.equal(mk.checks.gewoneOpleidingBeoordelen,true);
 assert.equal(mk.checks.korpspluimToekennen,false);
 const officer=simulateTechnicalRights('police_officer');
 assert.equal(officer.checks.korpspluimToekennen,true);
 assert.equal(officer.checks.gewoneOpleidingBeoordelen,true);
 const k9=simulateTechnicalRights('police_k9');
 assert.equal(k9.checks.k9SpecialisatieInstructeur,true);
 assert.equal(k9.checks.gewoneOpleidingBeoordelen,false);
 const council=simulateTechnicalRights('citizen_council');
 assert.equal(council.checks.burgerDossierSchrijven,true);
 assert.equal(council.checks.korpspluimToekennen,false);
 assert.throws(()=>simulateTechnicalRights('not-an-account'));
});
test('geen impersonatie, API schrijft nergens en de HTML is server-side afgeschermd',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const routes=readFileSync(new URL('../src/technical-access-simulator.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/technische-rollen-simulatie.html',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/technische-rollen-simulatie\.html'/);
 assert.match(server,/technicalCookieIsValid\(cookie,uid,id,/);
 assert.match(server,/installTechnicalSimulatorRoutes\(app,\{requireUser\}\)/);
 assert.match(routes,/app\.get\('\/api\/technical-simulator\/profiles',requireUser/);
 assert.match(routes,/app\.get\('\/api\/technical-simulator\/profile\/:id',requireUser/);
 assert.doesNotMatch(routes,/app\.(?:post|patch|put|delete)\(/);
 assert.match(html,/fictieve profielen/i);
 assert.match(html,/getIdToken/);
});
