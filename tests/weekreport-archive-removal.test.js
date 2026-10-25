import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  splitReportsByPeriod,mayRemoveWeekReport,automaticFortnightReports,
  parseAutomaticReportId
} from '../src/fortnight-report-policy.js';

const officer={discordId:'123456789012345678',role:'officierenkader',
  departments:['politie'],departmentRoles:{politie:'officierenkader'}};
const corps={...officer,role:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}};
const middle={...officer,role:'middenkader',
  departmentRoles:{politie:'middenkader'}};

test('police officer and corps may remove weekreport, without extending rights to other services',()=>{
  assert.equal(mayRemoveWeekReport(officer,'politie',[]),true);
  assert.equal(mayRemoveWeekReport(corps,'politie',[]),true);
  assert.equal(mayRemoveWeekReport(middle,'politie',[]),false);
  assert.equal(mayRemoveWeekReport({...officer,departments:[]},'politie',[]),false);
  assert.equal(mayRemoveWeekReport({...officer,departments:['ambulance'],
    departmentRoles:{ambulance:'officierenkader'}},'ambulance',[]),false);
});

test('archive contains only completed periods and retains older automatic IDs',()=>{
  const entries=[
    {id:'Fpolitie20261012',periodEnd:'2026-10-25'},
    {id:'oldManual',periodEnd:'2026-10-17'},
    {id:'futureManual',periodEnd:'2026-10-26'}
  ];
  const x=splitReportsByPeriod(entries,'2026-10-25');
  assert.deepEqual(x.active.map(r=>r.id),['Fpolitie20261012','futureManual']);
  assert.deepEqual(x.archive.map(r=>r.id),['oldManual']);
  assert.equal(parseAutomaticReportId('Fpolitie20261012')?.periodEnd,'2026-10-25');
  assert.deepEqual(automaticFortnightReports('politie','2026-11-02',2).map(r=>r.periodStart),
    ['2026-10-26','2026-10-12']);
  assert.throws(()=>splitReportsByPeriod(entries,'2026-02-31'));
});

test('report listing, viewing and downloads honor an audited removal marker',()=>{
  const api=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/weekrapporten.html',import.meta.url),'utf8');
  assert.match(api,/app\.delete\('\/api\/management\/reports\/:id'/);
  assert.match(api,/await marker\.create\(/);
  assert.match(api,/retainsDossierEntries:true/);
  assert.match(api,/const hidden=new Set\(removals\.docs\.map\(d=>d\.id\)\)/);
  assert.match(api,/if\(removal\.exists\)return \{status:404/);
  assert.match(ui,/id="reportArchiveList"/);
  assert.match(ui,/data-delete-report/);
  assert.match(ui,/window\.confirm\('Weekrapport/);
  assert.match(ui,/canRemoveReport=data\.canRemove===true/);
});
