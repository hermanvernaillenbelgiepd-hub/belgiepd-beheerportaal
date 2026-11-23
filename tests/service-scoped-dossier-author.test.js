import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actorFromPersonnel} from '../src/registrations.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='111111111111111111';
const user={discordId:id,uid:'discord:'+id,departments:['politie','ambulance','brandweer']};
const people=[
 {dept:'politie',personId:id,name:'Labo',rank:'INP',call:'428'},
 {dept:'ambulance',personId:id,name:'Labo',rank:'DIR-MED',call:'DIRMED01'},
 {dept:'brandweer',personId:id,name:'Labo',rank:'Sergeant',call:'OOF12'}
];
test('ambulance note author is recorded with own DIR-MED role, not unrelated INP rank',()=>{
 assert.deepEqual(actorFromPersonnel(user,people,'ambulance'),{
  discordId:id,name:'Labo',rank:'DIR-MED',call:'DIRMED01',dept:'ambulance'});
 assert.equal(actorFromPersonnel(user,people,'brandweer').rank,'Sergeant');
 assert.equal(actorFromPersonnel(user,people,'politie').rank,'INP');
 assert.equal(actorFromPersonnel(user,people).rank,'INP');
});
test('role context never comes from another account or ambiguous service membership',()=>{
 assert.equal(actorFromPersonnel({...user,departments:['politie']},people,'ambulance').rank,'INP');
 assert.equal(actorFromPersonnel({...user,discordId:'222222222222222222'},people,'ambulance'),null);
 assert.equal(actorFromPersonnel(user,[...people,people[1]],'ambulance'),null);
});
test('management notes and formal registration audit use the chosen case service',()=>{
 const management=read('src/management-routes.js');
 assert.match(management,/const actor=reportAuditActor\(req,snap\.data,dept\)/);
 assert.match(management,/registeredBy:represented\|\|actor,submittedByActor:actor/);
 assert.match(management,/actorFromPersonnel\(request\.bpd,roster,service\)/);
 const registration=read('src/registration-routes.js');
 assert.match(registration,/actorFromPersonnel\(req\.bpd,snap\.data,dept\)/);
 assert.match(registration,/registeredBy:represented\|\|actor,submittedByActor:actor/);
});
