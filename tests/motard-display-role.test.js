import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTARD_ROLE_IDS,motardRoleFromRoleIds,verifiedMotardDisplayRole,
 effectiveMotardDisplayRole} from '../src/motard-display-role.js';
import {validatePoliceSpecialtyEdit,verifiedSyncRoles} from '../src/organogram-placement-policy.js';

const guild='123456789012345678',now=1793300000000;
const identity=(...roleIds)=>({guildId:guild,verifiedAt:now,roleIds});
test('MOTARD role IDs match the approved BelgiumPD Discord roles',()=>{
 assert.deepEqual(MOTARD_ROLE_IDS,{
  instructeur:'1359656762289946755',
  volwaardig:'1358148694297415741',
  in_opleiding:'1365602771855740958'
 });
});
test('MOTARD ranks instructors above full members above trainees',()=>{
 assert.equal(motardRoleFromRoleIds([MOTARD_ROLE_IDS.in_opleiding]),'in_opleiding');
 assert.equal(motardRoleFromRoleIds([MOTARD_ROLE_IDS.volwaardig,MOTARD_ROLE_IDS.in_opleiding]),'volwaardig');
 assert.equal(motardRoleFromRoleIds(Object.values(MOTARD_ROLE_IDS)),'instructeur');
 assert.equal(motardRoleFromRoleIds(['123456789012345678']),'');
});
test('MOTARD verification requires matching fresh guild identity',()=>{
 assert.equal(verifiedMotardDisplayRole(identity(MOTARD_ROLE_IDS.in_opleiding),guild,now),'in_opleiding');
 assert.equal(verifiedMotardDisplayRole({...identity(MOTARD_ROLE_IDS.volwaardig),guildId:'999999999999999999'},guild,now),'');
 assert.equal(verifiedMotardDisplayRole(identity(MOTARD_ROLE_IDS.instructeur),guild,now+8*86400000),'');
 assert.equal(verifiedMotardDisplayRole({guildId:guild,verifiedAt:now,roleIds:['abc']},guild,now),'');
});
test('MOTARD manual display override wins over verified snapshot',()=>{
 assert.equal(effectiveMotardDisplayRole('in_opleiding','volwaardig'),'in_opleiding');
 assert.equal(effectiveMotardDisplayRole('','volwaardig'),'volwaardig');
 assert.equal(effectiveMotardDisplayRole('invalid','in_opleiding'),'in_opleiding');
});
test('MOTARD training role enters specialties without full qualification',()=>{
 const result=verifiedSyncRoles(identity(MOTARD_ROLE_IDS.in_opleiding),'politie',guild,now);
 assert.equal(result.specialties.includes('MOTARD'),true);
 assert.equal(result.instructorSpecialties.includes('MOTARD'),false);
});
test('MOTARD role edit remains constrained to existing specialty and one level',()=>{
 const base={specialties:['MOTARD'],instructorSpecialties:[],
  teacherSpecialties:[],k9Role:'',motardRole:'in_opleiding',reason:'Opleiding gestart'};
 assert.equal(validatePoliceSpecialtyEdit(base).motardRole,'in_opleiding');
 assert.equal(validatePoliceSpecialtyEdit({...base,motardRole:'volwaardig'}).motardRole,'volwaardig');
 assert.equal(validatePoliceSpecialtyEdit({...base,motardRole:'instructeur',
  instructorSpecialties:['MOTARD']}).motardRole,'instructeur');
 assert.throws(()=>validatePoliceSpecialtyEdit({...base,specialties:[]}),/MOTARD-lidmaatschap/);
 assert.throws(()=>validatePoliceSpecialtyEdit({...base,motardRole:'instructeur'}),/instructeursselectie/);
 assert.throws(()=>validatePoliceSpecialtyEdit({...base,motardRole:'volwaardig',
  instructorSpecialties:['MOTARD']}),/één functieniveau/);
});
