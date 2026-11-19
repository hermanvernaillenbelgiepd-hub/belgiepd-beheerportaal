import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qualificationSpecialty,trainingSpecialtyCandidate} from '../public/training-course-catalog.js';
import {publicSpecializations} from '../src/specialization-policy.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Alleen expliciet gekoppelde specialisatieopleidingen geven een STAGE of JA kandidaat',()=>{
 assert.equal(qualificationSpecialty('politie','VERKEERSCONTROLE'),null);
 assert.equal(qualificationSpecialty('politie','K-9'),'K9');
 assert.equal(qualificationSpecialty('brandweer','Ladderwagen'),'Ladderwagen');
 assert.equal(qualificationSpecialty('ambulance','PIT-MOTOR'),'PIT-MOTOR');
 assert.equal(qualificationSpecialty('depannage','F.A.S.T'),'F.A.S.T');
 assert.deepEqual(trainingSpecialtyCandidate({department:'politie',courseName:'K-9',
  result:'aanwezig',qualificationStage:'in_opleiding'}),{label:'K9',value:'Stage'});
 assert.deepEqual(trainingSpecialtyCandidate({department:'politie',courseName:'K-9',
  result:'geslaagd'}),{label:'K9',value:'Ja'});
 assert.equal(trainingSpecialtyCandidate({department:'politie',courseName:'K-9',
  result:'aanwezig'}),null);
 assert.equal(trainingSpecialtyCandidate({department:'politie',courseName:'K-9',
  result:'niet_geslaagd',qualificationStage:'in_opleiding'}),null);
});
test('Auditbare opleidingspatch wordt zichtbaar; handmatige leidingbeslissing primeert',()=>{
 const subject={dept:'politie',call:'490',specialties:[{label:'K9',value:'Nee'}]};
 const training={values:{K9:{value:'Stage',source:'training',trainingRecordId:'123456789abc'}}};
 const state=publicSpecializations(subject,training);
 assert.deepEqual([state.items.find(x=>x.label==='K9').value,
  state.items.find(x=>x.label==='K9').source],['Stage','training']);
 const manual={values:{K9:{value:'Ja',source:'manual'}}};
 assert.equal(publicSpecializations(subject,manual).items.find(x=>x.label==='K9').value,'Ja');
});
test('Beoordelingen actualiseren uitsluitend de eigen registratie en de gekende specialisatie',()=>{
 const server=source('src/role-routes.js');
 assert.ok(server.includes('syncTrainingSpecialty(tx,'));
 assert.ok(server.includes("status==='klaar_voor_manuele_invoer'?"));
 assert.ok(server.includes("found?.source==='manual'"));
 assert.ok(server.includes("values[priorLabel]?.trainingRecordId===recordId"));
 assert.ok(server.includes("registeredByDiscordId!==actor.discordId"));
 assert.ok(server.includes('onSpecialtyChanged?.()'));
});
