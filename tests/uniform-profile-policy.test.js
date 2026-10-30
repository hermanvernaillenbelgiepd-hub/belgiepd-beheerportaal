import test from 'node:test';
import assert from 'node:assert/strict';
import {policeCallSeries,policeUniformGroup,ambulanceFunction,displaySelectors}
 from '../public/uniform-profile-policy.js';
import {validateUniformAssignment,resolveUniformAssignment}
 from '../src/uniform-assignment-routes.js';
import {validateLibraryRule} from '../src/uniform-library-routes.js';

test('police calls have distinct grade markers while retaining one lower uniform',()=>{
 const samples=['200','S302','SANTO-485','501','SANTO-600*','SANTO 630'];
 for(const call of samples)
  assert.equal(policeUniformGroup({dept:'politie',call}),'basis_tm_ahinp');
 assert.equal(policeCallSeries('S302'),'300');
 assert.equal(policeCallSeries('SANTO-485'),'400');
 assert.equal(policeCallSeries('SANTO-600*'),'600');
 assert.equal(policeCallSeries('SANTO 630'),'600');
 assert.equal(policeCallSeries('910'),'910');
 assert.equal(policeCallSeries('930'),'930');
 assert.equal(policeUniformGroup({dept:'politie',call:'700'}),'hinp_1hinp');
 assert.equal(policeUniformGroup({dept:'politie',call:'900'}),'officieren');
});
test('a configurable uniform group includes aspirant-head inspector but not HINP',()=>{
 const rules=[{department:'politie',scope:'group',selector:'basis_tm_ahinp',
  uniformCode:'basisjas',badgeStyle:''}];
 for(const call of ['200','400','500','600'])
  assert.equal(resolveUniformAssignment({dept:'politie',call},rules).uniformCode,'basisjas');
 assert.equal(resolveUniformAssignment({dept:'politie',call:'700'},rules).uniformCode,'');
 assert.equal(resolveUniformAssignment({dept:'politie',call:'920'},rules).uniformCode,'');
 const data=validateUniformAssignment({department:'politie',scope:'group',
  selector:'basis_tm_ahinp',uniformCode:'basisjas',reason:'Basisjas voor de callgroepen'});
 assert.equal(data.key,'politie_group_basis_tm_ahinp');
 assert.throws(()=>validateUniformAssignment({...data,department:'ambulance'}),/doelgroep/);
});
test('police call-based rank assets are separate from uniforms',()=>{
 const person={dept:'politie',call:'SANTO-600',rank:'Aspirant Hoofdinspecteur'};
 assert.deepEqual(displaySelectors(person).slice(0,2),[
  ['call','600'],['rank','aspirant_hoofdinspecteur']]);
 const assignment=validateLibraryRule({department:'politie',kind:'rank',scope:'call',
  selector:'600',assetCode:'ahinp',reason:'Aspirant hoofdinspecteur eigen gradenplaat'});
 assert.equal(assignment.key,'politie_rank_call_600');
 assert.throws(()=>validateLibraryRule({...assignment,selector:'650'}),/doelgroep/);
});
test('fire helmet and plate remain linked to grade independent of call prefix',()=>{
 const person={dept:'brandweer',call:'OOFF-12',rank:'Sergeant'};
 assert.deepEqual(displaySelectors(person),[['rank','sergeant']]);
 const asset=validateLibraryRule({department:'brandweer',kind:'helmet',scope:'rank',
  selector:'sergeant',assetCode:'sergeant_helm',
  reason:'Sergeanten krijgen de eigen helm'});
 assert.equal(asset.key,'brandweer_helmet_rank_sergeant');
});
test('ambulance functions resolve badges and DIRMED text from calls and ranks',()=>{
 for(const [call,want] of [['AMB-01','ambulancier'],['HAMB-05','ambulancier'],
  ['VPK-02','vpk'],['HVPK-04','vpk'],['ARTS-01','arts'],
  ['HARTS-01','arts'],['DIRMED-01','dirmed']]){
  assert.equal(ambulanceFunction({dept:'ambulance',call}),want);
 }
 assert.equal(ambulanceFunction({dept:'ambulance',call:'AZLS-01',rank:'Verpleegkundige'}),'vpk');
 const rule=validateLibraryRule({department:'ambulance',kind:'profession',
  scope:'function',selector:'dirmed',assetCode:'dirmed_opschrift',
  reason:'Functieaanduiding DIRMED op uniform'});
 assert.equal(rule.key,'ambulance_profession_function_dirmed');
 assert.throws(()=>validateLibraryRule({...rule,department:'brandweer'}),/doelgroep/);
});
