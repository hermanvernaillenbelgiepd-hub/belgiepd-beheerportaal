import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
test('RECORDS separates dated historical snapshots from verified monthly hours',()=>{
 assert.match(html,/id="recordsPanel" class="activity-data-fold"/);
 assert.match(html,/id="recordsTop"/);
 assert.match(html,/15\/10\/2026 en 16\/11\/2026/);
 assert.match(html,/id="recordsHistorical" hidden/);
 assert.match(html,/id="recordsHistoricalTop"/);
 assert.match(html,/id="recordsDate"/);
 assert.match(html,/uitsluitend ter inzage/);
 assert.match(html,/niet noodzakelijk volledige kalendermaanden/);
});
test('RECORDS top five uses only authorized, verified recent calendar-month records',()=>{
 assert.match(script,/function renderVerifiedRecords\(scoped\)/);
 assert.match(script,/scoped\.filter\(p=>p\.verified===true&&Number\.isFinite\(p\.periodPlayHours\)/);
 assert.match(script,/\.slice\(0,5\)/);
 assert.match(script,/if\(\$\('recordsPanel'\)\.open\)renderVerifiedRecords\(scoped\)/);
 assert.match(script,/p\.periodLabel\|\|'Afgesloten maand'/);
 assert.doesNotMatch(script,/fetch\(['"]https:\/\/docs\.google\.com/);
});
test('big personnel table only renders after opening its details',()=>{
 assert.match(html,/id="personnelDetails" class="activity-data-fold"/);
 assert.match(script,/if\(!\$\('personnelDetails'\)\.open\)return;/);
 assert.match(script,/\$\('personnelDetails'\)\.addEventListener\('toggle'/);
 assert.match(html,/id="rows"/);
});
test('cadre statistics are lazy and retain their backend authority checks',()=>{
 assert.match(html,/id="cadreDetails" class="activity-data-fold"/);
 assert.match(script,/if\(available\.length&&\$\('cadreDetails'\)\.open\)await loadCadre\(\)/);
 assert.match(script,/cadreApi\('\/api\/cadre-activity\/config'\)/);
 assert.match(script,/cadreApi\('\/api\/cadre-activity\/overview\?department='/);
});
test('no historical bot writes or personnel status actions added and module JavaScript parses',()=>{
 assert.doesNotThrow(()=>new Function(script.replace(/^import\s+.*?;\s*$/m,'')));
 assert.match(script,/fetch\('\/api\/activity-center\/overview'/);
 assert.match(html,/id="returnPanel" class="activity-warnings" hidden/);
 assert.doesNotMatch(html,/\/api\/activity-records\/write/);
});

test('historical RECORDS rows are matched by both Discord IDs and never used for activity pings',async()=>{
 const {parseHistoricalRecords}=await import('../src/activity-records-model.js');
 const header=Array(23).fill('');header[10]='15-10-2026';header[11]='16-11-2026';
 const make=(left,right,a,b)=>{const r=Array(23).fill('');r[3]=left;r[7]=right;r[10]=a;r[11]=b;return r};
 const id='123456789012345678',another='222222222222222222';
 const parsed=parseHistoricalRecords([header,make(id,id,'28','76'),make(another,id,'44','80')]);
 assert.deepEqual(parsed.dates,['2026-10-15','2026-11-16']);
 assert.deepEqual(parsed.items.get(id),[{date:'2026-10-15',hours:28},{date:'2026-11-16',hours:76}]);
 assert.equal(parsed.items.size,1);
 const duplicates=parseHistoricalRecords([header,make(id,id,'28','76'),make(id,id,'29','77')]);
 assert.equal(duplicates.items.size,0);
 assert.equal(duplicates.duplicates,1);
 const invalid=parseHistoricalRecords([header,make(id,id,'=UNTRUSTED','-')]);
 assert.deepEqual(invalid.items.get(id),[]);
});
test('read-only historical sheet is loaded server-side and projected only onto authorized people',async()=>{
 const {readFileSync}=await import('node:fs');
 const route=readFileSync(new URL('../src/activity-center-routes.js',import.meta.url),'utf8');
 assert.match(route,/RECORDS!A3:W750/);
 assert.match(route,/readRecords=loadRecords/);
 assert.match(route,/parseHistoricalRecords\(historical\.rows\)/);
 assert.match(route,/historicalRecords:historicalRows\.items\.get\(row\.discordId\)\|\|\[\]/);
 assert.doesNotMatch(route,/app\.post\('\/api\/activity-center\/records/);
});
