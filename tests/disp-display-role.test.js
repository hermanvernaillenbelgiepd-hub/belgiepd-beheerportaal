import test from 'node:test';
import assert from 'node:assert/strict';
import {DISP_ROLE_IDS,dispRoleFromRoleIds,verifiedDispDisplayRole,
 effectiveDispDisplayRole} from '../src/disp-display-role.js';
import {validatePoliceSpecialtyEdit,verifiedSyncRoles} from '../src/organogram-placement-policy.js';

const guild='123456789012345678',now=1793300000000;
const identity=(...roleIds)=>({guildId:guild,verifiedAt:now,roleIds});
test('DISPATCH role IDs match the approved Discord selection/full/instructor roles',()=>{
 assert.deepEqual(DISP_ROLE_IDS,{
  instructeur:'1393050971604516904',
  volwaardig:'1309532438019706963',
  in_opleiding:'1337852029611016233'
 });
});
test('DISPATCH instructor > member > selection priority',()=>{
 assert.equal(dispRoleFromRoleIds([DISP_ROLE_IDS.in_opleiding]),'in_opleiding');
 assert.equal(dispRoleFromRoleIds([DISP_ROLE_IDS.volwaardig,DISP_ROLE_IDS.in_opleiding]),'volwaardig');
 assert.equal(dispRoleFromRoleIds(Object.values(DISP_ROLE_IDS)),'instructeur');
 assert.equal(dispRoleFromRoleIds(['123456789012345678']),'');
});
test('DISPATCH roles require fresh, verified matching-guild identity',()=>{
 assert.equal(verifiedDispDisplayRole(identity(DISP_ROLE_IDS.in_opleiding),guild,now),'in_opleiding');
 assert.equal(verifiedDispDisplayRole({...identity(DISP_ROLE_IDS.volwaardig),guildId:'999999999999999999'},guild,now),'');
 assert.equal(verifiedDispDisplayRole(identity(DISP_ROLE_IDS.instructeur),guild,now+8*86400000),'');
});
test('DISPATCH manual display-only selection overrides verified snapshot',()=>{
 assert.equal(effectiveDispDisplayRole('in_opleiding','volwaardig'),'in_opleiding');
 assert.equal(effectiveDispDisplayRole('','volwaardig'),'volwaardig');
 assert.equal(effectiveDispDisplayRole('invalid','in_opleiding'),'in_opleiding');
});
test('DISPATCH SELECTIE is never an instructor or full Discord member',()=>{
 const result=verifiedSyncRoles(identity(DISP_ROLE_IDS.in_opleiding),'politie',guild,now);
 assert.equal(result.specialties.includes('DISP'),true);
 assert.equal(result.instructorSpecialties.includes('DISP'),false);
});
test('DISPATCH manual level is constrained to one function',()=>{
 const base={specialties:['DISP'],instructorSpecialties:[],teacherSpecialties:[],
  k9Role:'',motardRole:'',dispRole:'in_opleiding',reason:'Opleiding gestart'};
 assert.equal(validatePoliceSpecialtyEdit(base).dispRole,'in_opleiding');
 assert.equal(validatePoliceSpecialtyEdit({...base,dispRole:'volwaardig'}).dispRole,'volwaardig');
 assert.equal(validatePoliceSpecialtyEdit({...base,dispRole:'instructeur',
  instructorSpecialties:['DISP']}).dispRole,'instructeur');
 assert.throws(()=>validatePoliceSpecialtyEdit({...base,specialties:[]}),/DISP-lidmaatschap/);
 assert.throws(()=>validatePoliceSpecialtyEdit({...base,dispRole:'instructeur'}),/instructeursselectie/);
 assert.throws(()=>validatePoliceSpecialtyEdit({...base,dispRole:'volwaardig',
  instructorSpecialties:['DISP']}),/één functieniveau/);
});
