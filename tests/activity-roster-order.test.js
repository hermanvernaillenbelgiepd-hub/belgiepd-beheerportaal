import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activityRosterGroup,activityRosterGroupLabel,
  sortActivityLikePersonnel} from '../public/activity-roster-order.js';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const person=(department,call,name=call)=>({department,call,name,discordId:'100000000000000001'});
test('Activiteitscentrum volgt de personeelslijst: politie naar kader en nummer, diensten erna',()=>{
 const input=[
   person('ambulance','AZLS 1'),person('politie','205'),
   person('politie','405'),person('politie','910'),
   person('brandweer','BW 2'),person('politie','950'),
   person('politie','008'),person('politie','SANTO 432'),
   person('politie','700'),person('politie','900'),
   person('politie','105'),person('politie','301')
 ];
 const source=[...input];
 const sorted=sortActivityLikePersonnel(input);
 assert.deepEqual(sorted.filter(p=>p.department==='politie').map(p=>p.call),
   ['900','910','950','700','SANTO 432','405','301','205','105','008']);
 assert.deepEqual(sorted.slice(-2).map(p=>p.department),['brandweer','ambulance']);
 assert.deepEqual(input,source,'Sorting must not mutate fetched telemetry or other data');
});
test('Dezelfde kaderindeling en scheiding tussen diensten als de personeelslijst',()=>{
 assert.equal(activityRosterGroup(person('politie','900')),'politie:korpsleiding');
 assert.equal(activityRosterGroup(person('politie','920')),'politie:officierenkader');
 assert.equal(activityRosterGroup(person('politie','888')),'politie:middenkader');
 assert.equal(activityRosterGroup(person('politie','SANTO 432')),'politie:basiskader');
 assert.equal(activityRosterGroup(person('politie','225')),'politie:agentenkader');
 assert.equal(activityRosterGroupLabel(person('politie','432')),
  'Politie · BASISKADER');
 assert.equal(activityRosterGroupLabel(person('brandweer','BW 2')),'Brandweer');
});
test('De sortering is onafhankelijk van de opvolging: geen statuswijzigingen',()=>{
 const arr=[{...person('politie','432'),kind:'inactief',daysInactive:32},
  {...person('politie','555'),kind:'ok',daysInactive:0}];
 const out=sortActivityLikePersonnel(arr);
 assert.deepEqual(out.map(p=>p.call),['555','432']);
 assert.equal(out.find(p=>p.call==='432').kind,'inactief');
 assert.equal(arr[0].kind,'inactief');
});
test('De vaste uitlijning deelt de zijmenukolommen over alle schermen',()=>{
 const css=get('public/bpd-navigation.css');
 const nav=get('public/bpd-navigation.js');
 const activity=get('public/activiteitscentrum.html');
 assert.match(css,/#bpdSidebar \.bpd-side-links a\{\s*display:grid;grid-template-columns:18px/);
 assert.match(css,/\.portal > aside nav a\{\s*display:grid;grid-template-columns:18px/);
 assert.match(css,/body\.bpd-shell > main\{\s*margin-left:0!important;margin-right:0!important/);
 assert.match(css,/\.portal > \.surface > main\{\s*margin-left:0!important;margin-right:0!important/);
 assert.match(nav,/className='bpd-home-side-icon'/);
 assert.match(nav,/className='bpd-home-side-label'/);
 assert.match(activity,/sortActivityLikePersonnel\(records\.filter/);
 assert.match(activity,/activity-group-row/);
});
