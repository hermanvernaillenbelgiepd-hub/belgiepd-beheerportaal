import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('politioneel dossier toont diensturen apart van historische speeltijd',()=>{
 const h=read('public/personeelsbeheer.html');
 assert.match(h,/id="personnelPlaytime"/);assert.match(h,/id="personnelDutySummary"/);
 assert.match(h,/void loadPersonnelDuty\(p\)/);
 assert.match(h,/api\/duty-times\/dossiers/);
});
test('brandweerdossier toont diensturen alleen voor toegelaten leiding',()=>{
 const h=read('public/brandweerdossier.html');
 assert.match(h,/fireDutySummary/);assert.match(h,/data\.visibility/);
 assert.match(h,/api\/duty-times\/dossiers\/brandweer/);
});
