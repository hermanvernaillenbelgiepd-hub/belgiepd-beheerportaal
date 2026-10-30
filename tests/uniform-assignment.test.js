import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUniformAssignment,resolveUniformAssignment,selectorFor} from '../src/uniform-assignment-routes.js';
const base={department:'politie',scope:'rank',selector:'eerste_hoofdcommissaris',
 uniformCode:'hcp',badgeStyle:'federaal',reason:'Eigen HCP-uniform goedgekeurd voor deze graad'};
test('uniform assignments are visuals and can never promote members',()=>{
 const r=validateUniformAssignment(base);
 assert.equal(r.key,'politie_rank_eerste_hoofdcommissaris');
 assert.equal(r.uniformCode,'hcp');
 assert.equal(r.badgeStyle,'federaal');
 assert.equal(Object.hasOwn(r,'role'),false);
 assert.equal(Object.hasOwn(r,'access'),false);
});
test('person > rank > cadre > service; properties inherit independently',()=>{
 const rules=[
  {department:'politie',scope:'service',selector:'default',uniformCode:'silver',badgeStyle:'lokaal'},
  {department:'politie',scope:'cadre',selector:'korpsleiding',uniformCode:'gold',badgeStyle:''},
  {department:'politie',scope:'rank',selector:'eerste_hoofdcommissaris',uniformCode:'hcp',badgeStyle:'federaal'},
  {department:'politie',scope:'person',selector:'123456789012345678',uniformCode:'speciale_jas',badgeStyle:''}
 ];
 const person={dept:'politie',rank:'Eerste Hoofdcommissaris',tier:'Korpsleiding',personId:'123456789012345678'};
 assert.deepEqual(resolveUniformAssignment(person,rules),{uniformCode:'speciale_jas',badgeStyle:'federaal'});
 assert.deepEqual(resolveUniformAssignment({...person,personId:null},rules),{uniformCode:'hcp',badgeStyle:'federaal'});
 assert.deepEqual(resolveUniformAssignment({...person,rank:'Inspecteur',personId:null},rules),{uniformCode:'gold',badgeStyle:'lokaal'});
 assert.deepEqual(resolveUniformAssignment({...person,dept:'brandweer'},rules),{uniformCode:'',badgeStyle:''});
});
test('departments without verified ID can use callsign fallback',()=>{
 const rule={department:'brandweer',scope:'person',selector:'call_off_02',
  uniformCode:'officier',badgeStyle:''};
 const result=resolveUniformAssignment({dept:'brandweer',call:'OFF-02',rank:'Kolonel'},[rule]);
 assert.equal(result.uniformCode,'officier');
 assert.equal(selectorFor('person','call_off_02'),'call_off_02');
});
test('uniform assignment payload rejects unknown, over-broad, and malicious values',()=>{
 for(const change of [
  {department:'niet_bestaand'},{scope:'beheerrechten'},
  {selector:'../../staff'},{scope:'person',selector:'naam zonder ID'},
  {uniformCode:'../../admin'},{badgeStyle:'geheim'},
  {reason:'kort'},{role:'korpsleiding'},{giveAwards:true}
 ])assert.throws(()=>validateUniformAssignment({...base,...change}));
});
