import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageLifecycleDepartment,canManagePersonnelLifecycle,
 canReadPersonnelLifecycle,canGloballyArchivePersonnel,
 canApproveServiceReentry,canSupervisePersonnelLifecycle} from '../src/personnel-lifecycle-access.js';
const id='123456789012345678',other='123456789012345679';
const actor=(dept='burger')=>({uid:'discord:'+id,discordId:id,role:'korpsleiding',
 departments:[dept],departmentRoles:{[dept]:'korpsleiding'},
 dossierAllowedDepartments:[dept],dossierNativeDepartments:[dept]});
const citizen={dept:'burger',personId:other,rank:'Burger',name:'Citizen'};
test('Burger lifecycle is scoped without reviving retired dossiers',()=>{
 assert.equal(canManageLifecycleDepartment(actor(),'burger'),true);
 assert.equal(canReadPersonnelLifecycle(actor(),citizen),true);
 assert.equal(canManagePersonnelLifecycle(actor(),citizen),true);
 assert.equal(canManageLifecycleDepartment(actor('politie'),'burger'),false);
 assert.equal(canManagePersonnelLifecycle(actor(),{...citizen,personId:id}),false);
});
test('middle cadre or Board alone has no archive rights',()=>{
 const mid={...actor(),role:'middenkader',departmentRoles:{burger:'middenkader'}};
 assert.equal(canManagePersonnelLifecycle(mid,citizen),false);
 assert.equal(canManagePersonnelLifecycle({...mid,boardPersonnelAdmin:true},citizen),false);
 assert.equal(canManagePersonnelLifecycle({...actor(),uid:'discord:000000000000000001'},citizen),false);
});
test('signed technical mode retains five-service access',()=>{
 const technical={uid:'discord:'+id,discordId:id,role:'beheerder',
 portalTechnicalMode:true,profileTechnicalAvailable:true};
 for(const dept of ['politie','brandweer','ambulance','depannage','burger'])
  assert.equal(canManageLifecycleDepartment(technical,dept),true);
 assert.equal(canManagePersonnelLifecycle(technical,citizen),true);
 assert.equal(canManageLifecycleDepartment({...technical,profileTechnicalAvailable:false},'burger'),false);
});
test('Police leadership does not inherit other service authority',()=>{
 assert.equal(canManageLifecycleDepartment(actor('politie'),'burger'),false);
 assert.equal(canManageLifecycleDepartment(actor('politie'),'ambulance'),false);
});

test('only verified Police Officer/Corps can globally retire every service; local service may only retire itself',()=>{
 const actorId=id,targetId=other;
 const authorized={uid:'discord:'+actorId,discordId:actorId,
  role:'officierenkader',discordPoliceRank:'officierenkader',
  departments:['politie'],departmentRoles:{politie:'officierenkader'},
  dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']};
 for(const dept of ['politie','brandweer','ambulance','depannage','burger']){
  const person={dept,personId:targetId,rank:'Medewerker',call:'X12'};
  assert.equal(canGloballyArchivePersonnel(authorized,person),true,dept);
  assert.equal(canApproveServiceReentry(authorized,person),true,dept);
  if(dept!=='politie')assert.equal(canManagePersonnelLifecycle(authorized,person),false,
    'Centraal toezicht geeft nooit lokale schrijfrechten voor '+dept);
 }
 assert.equal(canSupervisePersonnelLifecycle(authorized),true);
 assert.equal(canGloballyArchivePersonnel({...authorized,discordPoliceRank:null},citizen),false);
 assert.equal(canGloballyArchivePersonnel({...authorized,role:'basiskader'},citizen),false);
 assert.equal(canGloballyArchivePersonnel({...authorized,uid:'discord:000000000000000001'},citizen),false);
 assert.equal(canGloballyArchivePersonnel({...authorized,discordId:targetId},citizen),false);
 const local=actor('burger');
 assert.equal(canManagePersonnelLifecycle(local,citizen),true);
 assert.equal(canGloballyArchivePersonnel(local,citizen),false);
});
