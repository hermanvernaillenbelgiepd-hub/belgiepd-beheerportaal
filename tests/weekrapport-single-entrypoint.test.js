import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('weekreports preserve history, but hide the duplicate manual entry form',()=>{
 const html=read('public/weekrapporten.html');
 assert.ok(html.includes('<summary>Historische dossierregistraties (raadplegen)</summary>'));
 assert.ok(html.includes('<section id="legacyReportEntry" hidden inert aria-hidden="true">'));
 assert.ok(html.includes('id="caseForm"')&&html.includes('id="saveCase"'));
 const start=html.indexOf('<section id="legacyReportEntry"'),end=html.indexOf('</section>',start);
 assert.ok(start>0&&end>start);
 assert.ok(html.indexOf('id="caseForm"')>start&&html.indexOf('id="caseForm"')<end);
 assert.ok(html.indexOf('id="saveCase"')>start&&html.indexOf('id="saveCase"')<end);
 assert.ok(html.indexOf('id="caseDept"')<start&&html.indexOf('id="casePerson"')<start);
 assert.ok(html.includes('id="caseList"'));
 assert.ok(html.includes('Nieuwe registraties maak je uitsluitend in het bevoegde personeelsdossier'));
});
test('weekreports still read cases and training, and preserve historical APIs',()=>{
 const route=read('src/management-routes.js');
 assert.ok(route.includes("db().collection('bpd_cases')"));
 assert.ok(route.includes("db().collection('bpd_training')"));
 assert.ok(route.includes("app.post('/api/management/cases',requireUser"));
 assert.ok(route.includes('reportSections(result,report.periodStart,report.periodEnd)'));
});
