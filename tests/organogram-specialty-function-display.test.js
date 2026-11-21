import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePoliceSpecialtyEdit,validatePlacement,manualDisplay,mergePlacement} from '../src/organogram-placement-policy.js';
import {specialtyInstructorRoles} from '../public/assets/organogram-hierarchie-model.js';
const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const roleEdit={specialties:['AE'],instructorSpecialties:[],teacherSpecialties:[],
 functionOverrides:{AE:'groepsleider'},k9Role:'',motardRole:'',dispRole:'',aeRole:'',reason:'Groepsfunctie verduidelijken'};
test('police officers can classify group leader separately',()=>{
 const valid=validatePoliceSpecialtyEdit(roleEdit);
 assert.equal(valid.functionOverrides.AE,'groepsleider');
 const placement=validatePlacement({boardRole:'none',leadershipTier:'none',displayOrder:0,
  teachingRoles:[],displayLabels:[],...valid},'politie');
 const merged=mergePlacement({dept:'politie',name:'Test',call:'400',rank:'Inspecteur',specialties:[]},placement,
  {teachingRoles:['instructeur'],instructorSpecialties:['AE'],specialties:['AE'],synced:true});
 assert.deepEqual(merged.groupLeaderSpecialties,['AE']);
 assert.deepEqual(merged.instructorSpecialties,[]);
 assert.deepEqual(specialtyInstructorRoles(merged,'AE'),[]);
 assert.deepEqual(merged.teachingRoles,[]);
});
test('independent group and instructor classification never grants permissions',()=>{
 const yes=validatePoliceSpecialtyEdit({...roleEdit,functionOverrides:{AE:'beide'}});
 const merged=mergePlacement({dept:'politie',name:'Test',call:'400',rank:'Inspecteur',specialties:[]},
  validatePlacement({boardRole:'none',leadershipTier:'none',displayOrder:0,teachingRoles:[],displayLabels:[],...yes},'politie'),
  {teachingRoles:[],instructorSpecialties:[],specialties:['AE'],synced:true});
 assert.deepEqual(merged.groupLeaderSpecialties,['AE']);
 assert.deepEqual(specialtyInstructorRoles(merged,'AE'),['instructeur']);
 assert.throws(()=>validatePoliceSpecialtyEdit({...roleEdit,functionOverrides:{AE:'admin'}}));
 assert.throws(()=>validatePoliceSpecialtyEdit({...roleEdit,functionOverrides:{K9:'groepsleider'}}));
 assert.match(page,/choice\.dataset\.role='functionOverride'/);
 assert.match(page,/Groepsleider én instructeur/);
});
