import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageLifecycleDepartment,canManagePersonnelLifecycle,
 canReadPersonnelLifecycle} from '../src/personnel-lifecycle-access.js';
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
