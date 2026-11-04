import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffActivityFollowup} from '../src/staff-activity-followup.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const uid='930930930930930930';
const actor=(policeRole='officierenkader')=>({
 uid:'discord:'+uid,discordId:uid,role:policeRole,
 departments:['politie'],departmentRoles:{politie:policeRole},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie'],
 discordPoliceRank:policeRole
});
const person=(call,status,personId,name=call,rank='Inspecteur van Politie')=>({
 dept:'politie',personId,call,status,name,rank
});
const roster=[
 person('432','50/50','100000000000000001','Arixx'),
 person('520','inactief','100000000000000002','Tweede'),
 person('310','Actief','100000000000000003','Derde'),
 person('920','50/50','100000000000000004','Officier','Aspirant Commissaris'),
 {dept:'brandweer',personId:'100000000000000005',name:'BW',call:'BW-5',
 status:'50/50',rank:'Brandweerman'}
];

test('Officier 930 ziet personeelsleden met status 50/50 en INACTIEF uit toegestane politiedossiers',()=>{
 const result=staffActivityFollowup(actor(),roster);
 assert.equal(result.allowed,true);
 assert.deepEqual(result.people.map(p=>p.call),['432','520']);
 assert.deepEqual(result.counts,{'50/50':1,INACTIEF:1});
 assert.equal(result.source,'current_personnel_status');
 assert.equal(result.pingsAreSeparate,true);
 assert.equal(roster[0].status,'50/50','De status wordt niet veranderd');
});
test('Beveiligde 9xx-fiches en andere diensten worden niet onthuld door het meldingenoverzicht',()=>{
 const result=staffActivityFollowup(actor(),roster);
 assert.equal(result.people.some(p=>p.call==='920'),false);
 assert.equal(result.people.some(p=>p.department==='brandweer'),false);
});
test('Politie Basiskader ziet geen kaderoverzicht, zelfs bij een onjuiste dossiergrant',()=>{
 const a={...actor('basiskader'),dossierFullDepartments:['politie']};
 const result=staffActivityFollowup(a,roster);
 assert.equal(result.allowed,false);
 assert.deepEqual(result.people,[]);
});
test('Statusoverzicht dedupliceert, archiveert niet, telt vóór afkappen en beperkt persoonsgegevens',()=>{
 const records=[roster[0],roster[0],roster[1],roster[2],
  {...roster[1],lifecycleState:'archived'}];
 const result=staffActivityFollowup(actor(),records,{maxResults:1});
 assert.equal(result.people.length,1);
 assert.equal(result.total,2);
 assert.equal(result.limited,true);
 assert.deepEqual(result.counts,{'50/50':1,INACTIEF:1});
 assert.equal(Object.hasOwn(result.people[0],'email'),false);
});
test('Meldingen onderscheidt bestaande personeelsstatussen van verzonden persoonlijke pings',()=>{
 const html=read('public/meldingen.html');
 const routes=read('src/management-routes.js');
 assert.match(html,/id="staffActivityFollowupPanel"/);
 assert.match(html,/id="staffFollowup50"/);
 assert.match(html,/id="staffFollowupInactive"/);
 assert.match(html,/\/api\/management\/activity-followup/);
 assert.match(html,/Dit zijn geen verzonden activiteitspings/);
 assert.match(html,/loadStaffActivityFollowup\(\)/);
 assert.match(html,/\/api\/management\/pings\/mine/);
 assert.match(routes,/staffActivityFollowup\(req\.bpd,snapshot\.data\)/);
 assert.match(routes,/snapshot\.stale/);
 assert.match(routes,/private, no-store/);
 const endpoint=routes.slice(routes.indexOf("app.get('/api/management/activity-followup'"),
  routes.indexOf("app.get('/api/management/cases'"));
 assert.doesNotMatch(endpoint,/batch\.|\.create\(|\.update\(|\.delete\(/);
});
