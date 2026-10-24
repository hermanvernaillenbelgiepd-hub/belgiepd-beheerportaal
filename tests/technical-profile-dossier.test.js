import test from 'node:test';
import assert from 'node:assert/strict';
import {technicalActor} from '../src/portal-profile-mode.js';
import {applyDossierGrants} from '../src/dossier-grants.js';
import {canReadPersonnelSubject,canEditGeneralPersonnelInfo} from '../src/personnel-editor-policy.js';
import {canChangeSpecialty} from '../src/specialization-policy.js';

const id='111111111111111111';
const colleague='222222222222222222';
const base={uid:'discord:'+id,discordId:id,
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},
  profileTechnicalAvailable:true};
const full=technicalActor(base);
const departments=['politie','ambulance','brandweer','depannage'];
const technical={...full,dossierNativeDepartments:departments,
  dossierAllowedDepartments:departments,fireSubjectRoleSets:new Map()};
const chief={dept:'politie',personId:colleague,name:'Hoofdcommissaris',
  rank:'Eerste Hoofdcommissaris van Politie',call:'900'};
const firefighter={dept:'brandweer',personId:colleague,name:'Brandweerofficier',
  rank:'Brandweerleiding',call:'ZONE'};
test('Only a signed server-mode profile receives full dossier delegation',()=>{
  const granted=applyDossierGrants(full,['politie']);
  assert.deepEqual(granted.departments,departments);
  assert.deepEqual(granted.fullDepartments,departments);
  const notActive=applyDossierGrants({...base,portalTechnicalMode:true,
    profileTechnicalAvailable:false},['politie']);
  assert.deepEqual(notActive.departments,['politie']);
  assert.deepEqual(notActive.fullDepartments,[]);
});
test('Technical profile may inspect protected corps and fire dossiers',()=>{
  assert.equal(canReadPersonnelSubject(technical,chief),true);
  assert.equal(canReadPersonnelSubject(technical,firefighter),true);
  assert.equal(canReadPersonnelSubject({...technical,profileTechnicalAvailable:false},chief),false);
});
test('Verified technical profile edits across departments but never its own identity',()=>{
  assert.equal(canEditGeneralPersonnelInfo(technical,chief),true);
  assert.equal(canChangeSpecialty(technical,chief),true);
  assert.equal(canChangeSpecialty(technical,firefighter),true);
  assert.equal(canEditGeneralPersonnelInfo(technical,{...chief,personId:id}),false);
  assert.equal(canChangeSpecialty(technical,{...chief,personId:id}),false);
});
