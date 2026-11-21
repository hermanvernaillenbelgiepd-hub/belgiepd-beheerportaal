import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligibleGeneralTrainingInstructor} from '../src/training-general-instructor-policy.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const police=(call,rank='Inspecteur')=>({dept:'politie',call,rank});
test('In algemene politieopleidingen zijn alleen MK, OK en KL beschikbaar als opleider',()=>{
 for(const call of ['600','610','700','710','800','900','910','920','930'])
  assert.equal(eligibleGeneralTrainingInstructor(police(call)),true,'roepnummer '+call);
 for(const call of ['008','100','200','300','400','500'])
  assert.equal(eligibleGeneralTrainingInstructor(police(call)),false,'roepnummer '+call);
 assert.equal(eligibleGeneralTrainingInstructor({dept:'politie',call:'onbekend',rank:'Hoofdinspecteur'}),true);
 assert.equal(eligibleGeneralTrainingInstructor({dept:'brandweer',call:'001',rank:'Brandweerman'}),true);
});
test('Leerlingenlijst blijft volledig, enkel algemene opleiderlijst is gefilterd',()=>{
 const api=file('src/role-routes.js');
 assert.ok(api.includes('candidates.filter(eligibleGeneralTrainingInstructor)'));
 assert.ok(api.includes('res.json({department,people,instructors,limited:false})'));
 const register=file('public/rollen-opleidingen.html');
 const dossier=file('public/personeelsbeheer.html');
 assert.ok(register.includes('sortTrainingPeople(data.people||[],dept'));
 assert.ok(register.includes('sortTrainingPeople(data.instructors||[],dept'));
 assert.ok(dossier.includes('staffTrainingInstructorPeople=data.instructors||[]'));
 assert.ok(register.includes('ANDERE · zelf invullen'));
 assert.ok(dossier.includes('ANDERE · zelf invullen'));
});
test('Aanmelden voor gast; Mijn profiel pas na bevestigde sessie',()=>{
 const index=file('public/index.html'),nav=file('public/bpd-navigation.js');
 assert.ok(index.includes('id="dashboardProfileAction"'));
 assert.ok(index.includes("profileAction.textContent=confirmed?'👤 Mijn profiel':'👤 Aanmelden'"));
 assert.ok(index.includes("displayProfileAction(mode!=='guest')"));
 assert.ok(index.includes('logoutButton.hidden=!auth?.currentUser'));
 assert.ok(nav.includes("label:'Aanmelden',short:'Aanmelden'"));
 assert.ok(nav.includes('show(visible,true)'));
});
