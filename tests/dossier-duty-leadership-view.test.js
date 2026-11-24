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

test('Activiteitencentrum houdt de maandmeting apart en haalt diensturen alleen op aanvraag op',()=>{
 const h=read('public/activiteitscentrum.html');
 assert.match(h,/button\.onclick=async/);
 assert.match(h,/api\/duty-times\/dossiers/);
 assert.doesNotMatch(read('src/activity-center-routes.js'),/readOwnDutyTimes|bpd-duty-service-scope/);
});

test('fire dossier ES-module heeft geen dubbele declaraties',async()=>{
 const {spawnSync}=await import('node:child_process');
 const html=read('public/brandweerdossier.html');
 const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(match,'Module-script ontbreekt');
 const result=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:match[1],encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
