import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
test('RECORDS has a compact opt-in view and does not pretend historical snapshots were imported',()=>{
 assert.match(html,/id="recordsPanel" class="activity-data-fold"/);
 assert.match(html,/id="recordsTop"/);
 assert.match(html,/15\/10\/2026 en 16\/11\/2026/);
 assert.match(html,/Historische RECORDS-peilstanden zijn nog niet geïmporteerd/);
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
