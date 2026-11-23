import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');

test('summary stays compact while preserving existing statistics and source data',()=>{
 assert.match(html,/<details class="activity-help">/);
 assert.match(html,/<details id="statisticsDetails" class="activity-stats">/);
 assert.match(html,/id="statistics" class="counts"/);
 assert.match(html,/id="sourceNote"/);
 assert.match(html,/id="cadrePanel" hidden/);
 assert.match(html,/id="returnPanel" class="activity-warnings" hidden/);
});
test('clickable counters filter with independent authorized service/series/search scope',()=>{
 assert.match(html,/const scoped=records\.filter\(p=>\(!dept\|\|p\.department===dept\)/);
 assert.match(html,/matchesActivityPoliceSeries\(p,series\)/);
 assert.match(html,/const visible=sortActivityLikePersonnel\(scoped\.filter/);
 assert.match(html,/button\.setAttribute\('aria-pressed',String\(kind===key\)\)/);
 assert.match(html,/scoped\.filter\(p=>p\.kind===key\)\.length/);
 assert.match(html,/button\.addEventListener\('click'/);
 assert.match(html,/id="attentionOnly" type="checkbox"/);
 assert.match(html,/priorityKinds=new Set\(\['checking','50\/50','inactief','beoordelen','verlof_nazien'\]\)/);
 assert.match(html,/\$\('filter'\)\.value=kind===key\?'':key/);
});
test('reset restores every filter including series and attention without new permissions',()=>{
 assert.match(html,/id="resetActivityFilters" type="button"/);
 assert.match(html,/\$\('resetActivityFilters'\)\.addEventListener\('click'/);
 assert.match(html,/\$\('attentionOnly'\)\.checked=false/);
 assert.match(html,/updateActivitySeries\(\);\$\('activitySeries'\)\.value='';render\(\)/);
 assert.match(html,/id="department"/);
 assert.match(html,/id="filter"/);
 assert.match(html,/id="search"/);
});
test('source truth is not presented as verified when recent tracker evidence is missing',()=>{
 assert.match(html,/const measured=scoped\.filter\(p=>p\.verified===true\)\.length/);
 assert.match(html,/geen actuele metingen aangetroffen/);
 assert.match(html,/FiveM-broncontrole mislukt/);
 assert.doesNotMatch(html,/geverifieerde tracker gekoppeld/);
});
test('activity UI preserves separate official status, leave checking and read-only source',()=>{
 assert.match(html,/officiële personeelslijst en Discord-rollen worden hierdoor niet stilzwijgend gewijzigd/);
 assert.match(html,/p\.pingDossier\?\.discordConfirmed/);
 assert.match(html,/loadReturnChecks\(\)/);
 assert.match(html,/await cadreApi\('\/api\/cadre-activity\/config'/);
 assert.match(html,/const response=await fetch\('\/api\/activity-center\/overview'/);
 const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(module);
 assert.doesNotThrow(()=>new Function(module.replace(/^import\s+.*?;\s*$/m,'')));
});
