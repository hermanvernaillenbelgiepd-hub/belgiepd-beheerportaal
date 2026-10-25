import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  automaticFortnightReports,fortnightFor,isCurrentAutomaticReport,
  visibleFortnightReports,splitReportsByPeriod,mayReadFortnightReport
} from '../src/fortnight-report-policy.js';

const today='2026-10-25';
const auto=automaticFortnightReports('politie',today,52)[0];

test('A currently active automatic report is always listed, even after a previous test deletion',()=>{
  assert.equal(auto.periodStart,'2026-10-12');
  assert.equal(auto.periodEnd,'2026-10-25');
  assert.equal(isCurrentAutomaticReport(auto,today),true);
  assert.deepEqual(visibleFortnightReports([auto],new Set([auto.id]),today),[auto]);
  assert.deepEqual(splitReportsByPeriod(visibleFortnightReports([auto],new Set([auto.id]),today),today).active,[auto]);
});

test('The removal still applies to completed reports and manual concepts',()=>{
  assert.equal(isCurrentAutomaticReport(auto,'2026-10-26'),false);
  assert.deepEqual(visibleFortnightReports([auto],new Set([auto.id]),'2026-10-26'),[]);
  const manual={id:'manual',dept:'politie',source:'manual',periodEnd:'2026-10-25'};
  assert.deepEqual(visibleFortnightReports([manual],new Set([manual.id]),today),[]);
  assert.deepEqual(visibleFortnightReports([manual],new Set(),today),[manual]);
  assert.equal(fortnightFor('2026-10-26','politie').periodStart,'2026-10-26');
});

test('All four service reports are generated, but view access stays department-scoped',()=>{
  const depts=['politie','brandweer','ambulance','depannage'];
  for(const dept of depts)
    assert.equal(automaticFortnightReports(dept,today,52).length,1);
  const policeOfficer={role:'officierenkader',departments:['politie'],
    departmentRoles:{politie:'officierenkader'}};
  assert.equal(mayReadFortnightReport(policeOfficer,'politie',[]),true);
  assert.equal(mayReadFortnightReport(policeOfficer,'brandweer',[]),false);
  assert.equal(mayReadFortnightReport(policeOfficer,'ambulance',[]),false);
  assert.equal(mayReadFortnightReport(policeOfficer,'depannage',[]),false);
});

test('Service selector is visible, and the current report cannot be erased again',()=>{
  const page=readFileSync(new URL('../public/weekrapporten.html',import.meta.url),'utf8');
  const api=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
  assert.equal((page.match(/id="reportDept"/g)||[]).length,1);
  assert.match(page,/class="report-dept-filter"/);
  const visibleIdx=page.indexOf('class="report-dept-filter"');
  assert.ok(visibleIdx>page.indexOf('id="reportsView"'));
  assert.ok(visibleIdx>page.indexOf('id="legacyReportCreator"'));
  assert.match(page,/r\.source==='automatic'&&r\.status==='lopende_periode'/);
  assert.match(api,/if\(isCurrentAutomaticReport\(report,today\)\)/);
  assert.match(api,/visibleFortnightReports\(\[\.\.\.automated,\.\.\.legacy\],hidden,today\)/);
  assert.match(api,/removal\.exists&&!isCurrentAutomaticReport\(report,today\)/);
});
