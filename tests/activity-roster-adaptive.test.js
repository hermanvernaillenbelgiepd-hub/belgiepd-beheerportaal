import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('activity overview offers a police series control, filter and statistics reuse the same rows',()=>{
 const html=read('public/activiteitscentrum.html');
 assert.match(html,/id="activitySeries"/);
 assert.match(html,/updateActivitySeries\(\)/);
 assert.match(html,/matchesActivityPoliceSeries\(p,series\)/);
 assert.match(html,/id="statistics"/);
});
test('full roster automatically uses nonhorizontal compact row view below 1450px',()=>{
 const css=read('public/member-police-roster.css');
 assert.match(css,/@media\(min-width:1025px\) and \(max-width:1450px\)/);
 assert.match(css,/body\.roster-personnel-page \.mr-scroll > \.mr-table\{display:none!important\}/);
 assert.match(css,/body\.roster-personnel-page \.mr-scroll > \.mr-mobile-roster/);
 const js=read('public/member-police-roster.js');
 assert.match(js,/Toon specialisaties van/);
 assert.match(js,/for\(let index=5;index<sourceCells\.length;index\+\+\)/);
});
test('copy buttons are fetched independently from layout-edit permission',()=>{
 const page=read('public/personeelslijst.html');
 assert.match(page,/async function loadRosterCopyIds/);
 assert.doesNotMatch(page,/if\(!rosterColumnAllowed\|\|!token\)return/);
 assert.match(page,/await loadRosterCopyIds\(token\)/);
 const backend=read('src/member-dashboard-routes.js');
 assert.match(backend,/app\.get\('\/api\/member\/personnel-copy-ids',requireUser/);
});
