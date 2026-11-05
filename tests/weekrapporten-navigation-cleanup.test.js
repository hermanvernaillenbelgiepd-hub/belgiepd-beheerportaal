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
test('report registrations remain available through native closed details, not duplicate dossier view',()=>{
 assert.match(html,/<details id="reportRegistrations" class="report-archive"/);
 assert.match(html,/<summary>Historische rapportregistraties en aanvullende invoer<\/summary>/);
 assert.match(html,/<section id="casesView">/);
 assert.doesNotMatch(html,/<details id="reportRegistrations"[^>]* open[ >]/);
 assert.match(html,/openReportRegistrations\(\)/);
 assert.match(html,/location\.hash==='#registraties'/);
 assert.match(html,/<a href="\/dossiercentrum\.html">Dossiercentrum<\/a>/);
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
