import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  includedAfterReportRestart,automaticFortnightReports,fortnightFor,
  mayRemoveWeekReport,parseAutomaticReportId,isCurrentAutomaticReport
} from '../src/fortnight-report-policy.js';

const officer={discordId:'123456789012345678',role:'officierenkader',
 departments:['politie'],departmentRoles:{politie:'officierenkader'}};

test('report restart removes earlier source entries, not audit or later registrations',()=>{
 const time=ms=>({toMillis:()=>ms});
 const before=time(1000),reset=time(2000),after=time(3000);
 assert.equal(includedAfterReportRestart(before,null),true);
 assert.equal(includedAfterReportRestart(before,reset),false);
 assert.equal(includedAfterReportRestart(after,reset),true);
 assert.equal(includedAfterReportRestart(reset,reset),true);
 assert.equal(includedAfterReportRestart(undefined,reset),false);
 assert.equal(includedAfterReportRestart(new Date(3000),reset),true);
});
test('restart keeps original Monday fortnight boundaries and never grants extra review rights',()=>{
 const current=automaticFortnightReports('politie','2026-10-25',1)[0];
 assert.equal(isCurrentAutomaticReport(current,'2026-10-25'),true);
 assert.equal(parseAutomaticReportId(current.id)?.periodStart,'2026-10-12');
 assert.equal(fortnightFor('2026-10-26','politie').periodStart,'2026-10-26');
 assert.equal(mayRemoveWeekReport(officer,'politie',[]),true);
 assert.equal(mayRemoveWeekReport({...officer,departmentRoles:{politie:'middenkader'}},'politie',[]),false);
 assert.equal(mayRemoveWeekReport(officer,'ambulance',[]),false);
});
test('server filters case entries and canonical training for current report, also in exports',()=>{
 const routes=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 assert.match(routes,/app\.post\('\/api\/management\/reports\/:id\/restart',requireUser/);
 assert.match(routes,/Object\.keys\(body\)\.some\(k=>k!=='reason'\)/);
 assert.match(routes,/if\(!canReadServiceDossier\(req\.bpd,report\.dept\)\|\|/);
 assert.match(routes,/!mayRemoveWeekReport\(req\.bpd,report\.dept,snap\.data\)/);
 assert.match(routes,/tx\.create\(audit,\{action:'automatic_report_restarted'/);
 assert.match(routes,/includedAfterReportRestart\(d\.get\('createdAt'\),resetAt\)/);
 assert.match(routes,/includedAfterReportRestart\(r\.createdAt,resetAt\)/);
 assert.match(routes,/restartedAt:resetAt\?toIso\(resetAt\):null/);
 assert.match(routes,/app\.get\('\/api\/management\/reports\/:id\/docx'/);
});
test('restart button confirms and requires a reason, refreshed report stays printable',()=>{
 const ui=readFileSync(new URL('../public/weekrapporten.html',import.meta.url),'utf8');
 assert.match(ui,/data-restart-report/);
 assert.match(ui,/Het lopende weekrapport opnieuw starten/);
 assert.match(ui,/Motivering voor de rapportherstart/);
 assert.match(ui,/await loadReports\(\);\s*await openReport\(report\.id\)/);
});
