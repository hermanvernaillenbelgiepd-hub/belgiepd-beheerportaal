import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/weekrapporten.html',import.meta.url),'utf8');
test('single weekrapport page has no former three navigation buttons',()=>{
 assert.match(html,/<h1>Weekrapportcentrum<\/h1>/);
 assert.doesNotMatch(html,/id="tabCases"|id="tabReports"|class="tabbar"/);
 assert.doesNotMatch(html,/>Open personeelsdossiers<\/a>/);
 assert.doesNotMatch(html,/Centrale FICHE|TESTOMGEVING/);
 assert.match(html,/<section id="reportsView">/);
 assert.ok(html.indexOf('id="reportsView"')<html.indexOf('id="casesView"'));
});
test('oude rapportregistraties en manuele formulieren zijn ontoegankelijk vanuit de UI',()=>{
 assert.match(html,/<details id="reportRegistrations" class="report-archive" hidden inert aria-hidden="true"/);
 assert.match(html,/<div class="card hidden" id="legacyReportCreator" hidden inert aria-hidden="true"/);
 assert.match(html,/<section id="legacyReportEntry" hidden inert aria-hidden="true">/);
 assert.ok(!html.includes("if(location.hash==='#registraties'"));
 assert.ok(!html.includes('Registraties staan uit. Controleer BPD_ENABLE_MANAGEMENT_WRITES'));
 assert.ok(html.includes('<a href="/dossiercentrum.html">Dossiercentrum</a>'));
});
test('weekrapporten & old registrations stay operational, with unchanged API',()=>{
 for(const required of [
  'id="caseForm"','id="caseList"','id="reportList"','id="reportArchive"',
  'id="reportContents"','id="caseDept"','id="casePerson"','id="saveCase"',
  'id="reloadReports"','id="reportExportActions"',
  "api('/api/management/cases','POST'",
  "api('/api/management/reports'",
  'canClassifyTests','canRemoveReport','loadReports()'
 ])assert.ok(html.includes(required),'missing '+required);
 assert.doesNotMatch(html, /\$\('tabCases'\)|\$\('tabReports'\)|setTab\(/);
});
