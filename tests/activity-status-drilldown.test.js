import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('statuskaart gebruikt dezelfde bestaande-statutengroep voor teller en namenlijst',()=>{
 const dashboard=read('public/activity-dashboard.js');
 assert.match(dashboard,/const count=safe\.filter\(p=>belongs\(p,key\)\)\.length/);
 assert.match(dashboard,/const matched=people\.filter\(p=>belongs\(p,active\)\)/);
 assert.match(dashboard,/selected\.id='activitySelectedStatusPanel'/);
 assert.match(dashboard,/tabs\.followup\.append\(selected\)/);
 assert.match(dashboard,/renderSelectedStatus\(safe\)/);
 assert.match(dashboard,/selectTab\('followup'\);onSelect\(\)/);
 assert.match(dashboard,/p\.currentStatus/);
 assert.match(dashboard,/p\.lastConnection/);
 assert.match(dashboard,/p\.periodPlayHours/);
 assert.doesNotMatch(dashboard,/fetch\(|\/api\/|firebase/);
});
test('klik navigeert naar de zichtbare statussen en niet naar verborgen/lege opvolging',()=>{
 const html=read('public/activiteitscentrum.html');
 assert.match(html,/activitySelectedStatusPanel/);
 assert.match(html,/selected&&!selected\.hidden\?selected:\$\('personnelDetails'\)/);
 assert.match(read('public/activity-dashboard.js'),/Laatste verbinding/);
 const source=read('src/activity-center-routes.js');
 assert.doesNotMatch(source,/readOwnDutyTimes|bpd-duty-service-scope/);
});
test('de koppeling maakt onderscheid tussen laatste afgeronde dienst en connectie',()=>{
 const html=read('public/activiteitscentrum.html');
 assert.match(html,/laatste afgeronde dienst/);
 assert.match(html,/Geen geverifieerde verbindingsdatum/);
 assert.match(html,/Oude bron · indicatief/);
 assert.match(html,/geen geverifieerde maandmeting/);
});
test('Burger kan nu elke rubriek inklappen; data en registraties blijven bestaan',()=>{
 const html=read('public/burger-personeelsdossiers.html');
 assert.match(html,/installCitizenFolds\(\)/);
 assert.match(html,/citizen-fold-toggle/);
 assert.match(html,/data-collapsed="true"/);
 for(const id of ['citizenNotes','citizenObservations','citizenSanctions',
  'citizenCheckrideSection','citizenPromotions','citizenReport','citizenDeletionLog'])
  assert.match(html,new RegExp('id="'+id+'"'));
});
test('gewijzigde dashboard-module is syntactisch geldig',()=>{
 const script=read('public/activity-dashboard.js');
 const check=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:script,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
