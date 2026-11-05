import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registeredFireBasicTraining,verifiedSyncRoles,mergePlacement}
 from '../src/organogram-placement-policy.js';

const guild='1309532438053130324',now=Date.UTC(2026,10,3,5);
const member={guildId:guild,verifiedAt:now,roleIds:[guild]};
const record=(label,value)=>({dept:'brandweer',personId:guild,
 call:'BWM-07',name:'Testlid',rank:'Brandweerman',specialties:[{label,value}]});

test('membership alone never grants completed Brandweer basic training',()=>{
 assert.deepEqual(verifiedSyncRoles(member,'brandweer',guild,now).specialties,[]);
 assert.equal(registeredFireBasicTraining(record('Basis TR','Niet ingevuld')),false);
 assert.equal(registeredFireBasicTraining(record('Basis TR','Nee')),false);
 assert.equal(registeredFireBasicTraining(record('Basis TR','Stage')),false);
 assert.equal(registeredFireBasicTraining({...record('Basis TR','Ja'),dept:'politie'}),false);
});

test('registered Basis TR or legacy Basistraining completion is recognized',()=>{
 for(const label of ['Basis TR','Basistraining'])
  for(const value of ['Ja','JA','Behaald','Voltooid','Geslaagd'])
   assert.equal(registeredFireBasicTraining(record(label,value)),true);
 assert.equal(registeredFireBasicTraining({...record('Basis TR','Ja'),specialties:[]}),false);
});

test('registered basic training is distinct from a Brandweer specialization',()=>{
 const person=record('Basis TR','Ja');
 const merged=mergePlacement(person,null,verifiedSyncRoles(member,'brandweer',guild,now));
 assert.deepEqual(merged.specialties,[]);
 assert.equal(registeredFireBasicTraining(person),true);
 const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(route,/completedFireBasicTraining:registeredFireBasicTraining\(p\)/);
 assert.match(html,/Afgeronde opleidingen/);
 assert.match(html,/Basisopleiding Brandweer/);
 assert.match(html,/completedFireBasicTraining:p\.dept==='brandweer'&&p\.completedFireBasicTraining===true/);
});