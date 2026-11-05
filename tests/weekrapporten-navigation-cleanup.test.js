import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/weekrapporten.html',import.meta.url),'utf8');
test('weekrapporten is the primary view, with single personnel dossier destination',()=>{
 assert.match(html,/<h1>Weekrapportcentrum<\/h1>/);
 assert.match(html,/<button id="tabReports" class="tab active"/);
 assert.match(html,/<section id="reportsView"><div class="layout">/);
 assert.match(html,/<section id="casesView" class="hidden">/);
 assert.match(html,/<a class="tab" href="\/dossiercentrum\.html">Open personeelsdossiers<\/a>/);
 assert.doesNotMatch(html,/Centrale FICHE/);
 assert.doesNotMatch(html,/caseOpenFiche/);
 assert.doesNotMatch(html,/TESTOMGEVING/);
});
test('legacy case and report registrations and permissions remain functional',()=>{
 for(const x of ['id="caseForm"','id="caseList"','id="tabCases"',
   "currentTab='reports'",'id="reportArchive"',
   "api('/api/management/cases','POST'",
   "api('/api/management/reports'",
   "canClassifyTests",'id="reportExportActions"']){
  assert.ok(html.includes(x),'missing legacy/report function: '+x);
 }
 assert.match(html,/location\.hash==='#registraties'/);
 assert.match(html,/setTab\(\(data\.reportDepartments\|\|\[\]\)\.length\?'reports':'cases'\)/);
});
