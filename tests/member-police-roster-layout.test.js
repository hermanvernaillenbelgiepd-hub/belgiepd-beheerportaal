import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicPoliceRoster} from '../src/member-dashboard-routes.js';
import {basicObservationTargets} from '../src/basic-observation-policy.js';
import {maySubmit} from '../src/registrations.js';
import {PUBLIC_POLICE_SPECIALTIES} from '../public/member-police-roster.js';
import {policeOperationalTier} from '../public/police-roster-cadre.js';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const discordId='111111111111111111';
const person=(call,id=discordId)=>({
  dept:'politie',personId:id,name:'Voorbeeld',call,rank:'Inspecteur van politie',
  series:'Reeks 1',status:'Actief',
  specialties:[{label:'Radio BM',value:'Ja'},{label:'Motor',value:'Stage'}],
  secret:'VERBODEN',discordId:id,notes:'Geheim dossier'
});
test('Lower-cadre read-only API exposes exactly public roster and eleven specializations',()=>{
 const rows=publicPoliceRoster([person('400'),{
   ...person('900','222222222222222222'),name:'Tweede'
 }]);
 assert.equal(rows.length,2);
 for(const row of rows){
  assert.deepEqual(Object.keys(row).sort(),[
   'call','name','rank','series','status','specialties'].sort());
  assert.equal(row.specialties.length,11);
  assert.deepEqual(row.specialties.map(x=>x.label),[...PUBLIC_POLICE_SPECIALTIES]);
  assert.equal(row.specialties.find(x=>x.label==='Radio BM').value,'Ja');
  assert.equal(row.specialties.find(x=>x.label==='Motor').value,'Stage');
  assert.equal(JSON.stringify(row).includes(discordId),false);
  assert.equal(JSON.stringify(row).includes('Geheim'),false);
 }
 const missed=publicPoliceRoster([{
  ...person('500'),specialties:[{label:'K9',value:'Nee'}]
 }])[0];
 assert.equal(missed.specialties.find(x=>x.label==='SIV/WPR').value,'Niet ingevuld');
});
test('Home roster appears before personal controls and has wide rank and specialty columns',()=>{
 const home=read('public/index.html'),list=read('public/personeelslijst.html');
 const start=home.indexOf('<section id="memberDashboard"');
 const end=home.indexOf('<section id="guestDashboard"');
 const content=home.slice(start,end);
 assert.ok(content.includes('member-quick-actions'));
 assert.ok(content.indexOf('member-roster-primary')<content.indexOf('memberAccountStatus'));
 assert.ok(content.includes('id="memberRosterHead"'));
 assert.ok(content.includes('id="memberRosterRows"'));
 assert.ok(content.includes('id="memberRosterSearch"'));
 assert.ok(!content.includes('/registraties.html'));
 assert.ok(!content.includes('/dossiercentrum.html'));
 assert.ok(!content.includes('/weekrapporten.html'));
 assert.ok(!content.includes('/to-dienstbord.html'));
 assert.ok(content.includes('Mijn verlof'));
 assert.ok(content.includes('Meldingen'));
 assert.ok(content.includes('Opleiding aanvragen · binnenkort'));
 assert.ok(list.includes("from '/member-police-roster.js'"));
 assert.ok(list.includes('id="rosterHead"'));
 assert.ok(home.includes("from '/member-police-roster.js'"));
 const css=read('public/member-police-roster.css');
 assert.ok(css.includes('.mr-table tr.mr-divider'));
 assert.ok(css.includes('.mr-series-badge.mr-series-1'));
 assert.ok(css.includes('.mr-series-badge.mr-series-3'));
 assert.ok(css.includes('.mr-specialty.mr-yes'));
 assert.ok(css.includes('.mr-specialty.mr-stage'));
});
test('Agentenkader cannot submit formal or dedicated basic observations',()=>{
 const agent={role:'basiskader',departments:['politie'],
  departmentRoles:{politie:'basiskader'},discordId};
 const officer={...agent,role:'middenkader',
  departmentRoles:{politie:'middenkader'}};
 assert.equal(maySubmit(agent,'observatie','politie'),false);
 assert.equal(maySubmit(officer,'observatie','politie'),true);
 assert.equal(basicObservationTargets(agent,[person('200')]).author,null);
 assert.equal(basicObservationTargets(agent,[person('200')]).targets.length,0);
 // A verified Basiskader colleague starting with 4xx can observe lower staff
 // through the rank-gated separate route, not through the general form.
 const basic=person('400');
 const lower=person('300','222222222222222222');
 const eligible=basicObservationTargets(agent,[basic,lower]);
 assert.equal(eligible.author?.call,'400');
 assert.equal(eligible.targets.length,1);
 assert.equal(eligible.targets[0].call,'300');
 assert.equal(policeOperationalTier(basic),'basiskader');
 assert.equal(policeOperationalTier(person('200')),'agentenkader');
});
