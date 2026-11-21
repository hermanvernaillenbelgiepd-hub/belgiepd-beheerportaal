import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retainPoliceFunctionOverrides} from '../src/specialty-function-overrides.js';
import {validatePlacement,mergePlacement} from '../src/organogram-placement-policy.js';
import {specialtyInstructorRoles} from '../public/assets/organogram-hierarchie-model.js';
const routes=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
const roles=readFileSync(new URL('../public/rollenbeheer.html',import.meta.url),'utf8');
const old={AE:'groepsleider',K9:'beide'};
test('legacy Rollenbeheer save preserves all classified group functions',()=>{
 const preserved=retainPoliceFunctionOverrides({specialties:['AE','K9']},old,['AE','K9']);
 assert.deepEqual(preserved,old);
 assert.notEqual(preserved,old); // copies state, no accidental mutation
 const validated=validatePlacement({boardRole:'none',leadershipTier:'none',displayOrder:0,
  teachingRoles:[],displayLabels:[],specialties:['AE','K9'],instructorSpecialties:[],
  teacherSpecialties:[],functionOverrides:preserved,reason:'Wijziging alleen andere velden'},'politie');
 const merged=mergePlacement({dept:'politie',name:'Voorbeeld',call:'400',rank:'Inspecteur',specialties:[]},validated,
  {specialties:['AE','K9'],instructorSpecialties:['AE'],teachingRoles:['instructeur'],synced:true});
 assert.deepEqual(merged.groupLeaderSpecialties,['AE','K9']);
 assert.deepEqual(specialtyInstructorRoles(merged,'AE'),[]);
 assert.deepEqual(specialtyInstructorRoles(merged,'K9'),['instructeur']);
});
test('modern editor can intentionally change or remove a group classification',()=>{
 assert.deepEqual(retainPoliceFunctionOverrides({functionOverrides:{}},old,['AE','K9']),{});
 assert.deepEqual(retainPoliceFunctionOverrides({functionOverrides:{AE:'instructeur'}},old,['AE']),{AE:'instructeur'});
 assert.deepEqual(retainPoliceFunctionOverrides({specialties:['AE']},{},['AE']),{});
});
test('legacy editor may not silently delete a classified specialty',()=>{
 assert.throws(()=>retainPoliceFunctionOverrides({specialties:['K9']},old,['K9']),/Organogram/);
 assert.throws(()=>retainPoliceFunctionOverrides({specialties:[]},old,[]),/Organogram/);
 assert.match(roles,/Vastgelegde groepsfunctie/);
 assert.match(roles,/removedClassified/);
});
test('server transaction preserves current classification and audits the real next state',()=>{
 const section=routes.split("app.put('/api/organogram/police-specialties/:personId'")[1]
  ?.split('// Only technical management receives')[0]||'';
 assert.match(section,/resolvedOverrides=retainPoliceFunctionOverrides\(req\.body,preserve\.functionOverrides,values\.specialties\)/);
 assert.match(section,/catch\(e\)\{throw fault\(409,e\.message\)\}/);
 assert.match(section,/functionOverrides:resolvedOverrides/);
 assert.match(section,/functionOverrides:next\.functionOverrides/);
 assert.match(section,/tx\.create\(ref\.collection\('audit'\)\.doc\(\)/);
 assert.match(section,/accessRightsChanged:false/);
});
