import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coursesForDepartment,TRAINING_COURSE_CATALOG,trainingSelectLabels}
 from '../public/training-course-catalog.js';

test('Depannage training catalogue contains exactly five service courses',()=>{
 assert.deepEqual([...coursesForDepartment('depannage')],[
  'BASIS DEPANNAGE','F.A.S.T','CRANE','WEGENWERKEN',
  'AGENTSCHAP WEGEN EN VERKEER (LEIDING)'
 ]);
 assert.equal(coursesForDepartment('depannage').length,5);
});
test('Ambulance training catalogue contains exactly eight service courses',()=>{
 assert.deepEqual([...coursesForDepartment('ambulance')],[
  'BASIS TRAINING','MEDICATIE','MUG-HELI','PIT','PIT-MOTOR',
  'VERPLEEGKUNDIGE','ARTS','MIP'
 ]);
 assert.equal(coursesForDepartment('ambulance').length,8);
});
test('Brandweer remains unchanged and Police retains its existing HTML catalogue',()=>{
 assert.deepEqual([...coursesForDepartment('brandweer')],[
  'Logistiek / Signalisatie','Ladderwagen','Duiker','Bosbestrijding',
  'Brandweer-AMBU','RED-TEAM','Gevaarlijke stoffen','Basistraining'
 ]);
 assert.equal(coursesForDepartment('politie'),null);
 assert.equal(trainingSelectLabels.politie,'Kies een opleiding…');
 for(const item of [...TRAINING_COURSE_CATALOG.depannage,
   ...TRAINING_COURSE_CATALOG.ambulance]){
   assert.ok(!/GEWELD|WAPENGEBRUIK|MOTARD|RAGO|POLITIE/i.test(item));
 }
});
test('Central register and personnel dossier use the same service course module',()=>{
 const central=readFileSync(new URL('../public/rollen-opleidingen.html',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 for(const html of [central,dossier]){
  assert.ok(html.includes("from '/training-course-catalog.js'"));
  assert.ok(html.includes('coursesForDepartment('));
  assert.ok(html.includes("dept==='brandweer'"));
 }
 assert.match(central,/const originalCourses=\[/);
 assert.match(dossier,/const policeTrainingOptions=\[/);
 assert.match(central,/Bestaande opleiding/);
 assert.match(dossier,/Bestaande opleiding/);
});
