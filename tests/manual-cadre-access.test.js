import test from 'node:test';
import assert from 'node:assert/strict';
import {canRenameLowerPolice,validateLowerPoliceRename,canReadPersonnelSubject}
  from '../src/personnel-editor-policy.js';

const staffId='222222222222222222',actorId='111111111111111111';
const inspector={dept:'politie',personId:staffId,rank:'Inspecteur van politie',
  call:'400',name:'Voorbeeld',status:'Actief'};
const middle={uid:'discord:'+actorId,discordId:actorId,role:'middenkader',
  departments:['politie'],departmentRoles:{politie:'middenkader'},
  dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
test('Middenkader can correct only lower police ranks',()=>{
  assert.equal(canRenameLowerPolice(middle,inspector),true);
  assert.equal(canRenameLowerPolice(middle,{...inspector,rank:'Hoofdinspecteur van politie'}),false);
  assert.equal(canRenameLowerPolice(middle,{...inspector,personId:actorId}),false);
  assert.equal(canRenameLowerPolice({...middle,dossierNativeDepartments:[]},inspector),false);
  assert.equal(canRenameLowerPolice({...middle,role:'basiskader'},inspector),false);
  assert.equal(canRenameLowerPolice(middle,{...inspector,dept:'ambulance'}),false);
});
test('Name-only payload cannot carry rank, callsign or status changes',()=>{
  assert.deepEqual(validateLowerPoliceRename({name:'Nieuwe naam',reason:'Gecontroleerde naamswijziging',
    expectedRevision:2}),{name:'Nieuwe naam',reason:'Gecontroleerde naamswijziging',expectedRevision:2});
  assert.throws(()=>validateLowerPoliceRename({name:'Anders',call:'999',
    reason:'Gecontroleerde naamswijziging',expectedRevision:2}));
  assert.throws(()=>validateLowerPoliceRename({name:'A',reason:'reden',expectedRevision:0}));
});
test('Corps dossiers need fresh verified role or audited manual corps approval',()=>{
  const chief={...middle,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'},
    manualCorpsApproved:true,discordPoliceRank:null};
  const protectedPerson={...inspector,call:'900',rank:'Hoofdcommissaris van politie'};
  assert.equal(canReadPersonnelSubject(chief,protectedPerson),true);
  assert.equal(canReadPersonnelSubject({...chief,manualCorpsApproved:false},protectedPerson),false);
  assert.equal(canReadPersonnelSubject(middle,protectedPerson),false);
});
