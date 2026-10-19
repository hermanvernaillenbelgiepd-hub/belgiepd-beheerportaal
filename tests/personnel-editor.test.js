import test from 'node:test';
import assert from 'node:assert/strict';
import {validPersonnelKey,canViewPersonnel,canEditPersonnel,validatePersonnelChange,
 mergePersonnelEdits,EDITABLE_STATUSES} from '../src/personnel-editor-policy.js';
const officer={role:'officierenkader',departments:['politie','brandweer'],departmentRoles:{politie:'officierenkader',brandweer:'middenkader'},discordId:'505659510359064606'};
const chief={role:'korpsleiding',departments:['politie'],departmentRoles:{politie:'korpsleiding'},discordId:'111111111111111111'};
const id='298799630458552323';
const staff={id:'politie:'+id,personId:id,dept:'politie',name:'UNEMI',call:'930',rank:'Hoofdinspecteur (HINP)',
 status:'Actief',series:'Reeks 1',specialties:[{label:'Motor',value:'Ja'}]};
const payload={name:'UNEMI Aangepast',call:'932',status:'Actief',reason:'Na verificatie door bevoegde officier',expectedRevision:0};

test('Personnel keys require known services and genuine Discord IDs',()=>{
 assert.equal(validPersonnelKey('politie',id),true);
 assert.equal(validPersonnelKey('burger',id),false);
 assert.equal(validPersonnelKey('politie','fake'),false);
});
test('Officer may read their own services but cannot edit outside officer scope',()=>{
 assert.equal(canViewPersonnel(officer,'politie'),true);
 assert.equal(canViewPersonnel(officer,'brandweer'),true);
 assert.equal(canViewPersonnel(officer,'ambulance'),false);
 assert.equal(canEditPersonnel(officer,staff),true);
 assert.equal(canEditPersonnel(officer,{...staff,dept:'brandweer'}),false);
 assert.equal(canEditPersonnel(officer,{...staff,personId:officer.discordId}),false);
});
test('Rank boundaries restrict edits; an officer cannot edit officer or chief',()=>{
 assert.equal(canEditPersonnel(officer,{...staff,rank:'Aspirant Commissaris (ACP)'}),false);
 assert.equal(canEditPersonnel(chief,{...staff,rank:'Aspirant Commissaris (ACP)'}),true);
 assert.equal(canEditPersonnel(chief,{...staff,rank:'Commissaris (CP)'}),false);
 assert.equal(canEditPersonnel(chief,{...staff,rank:'Onbekend'}),false);
 const forged={...officer,role:'middenkader'};
 assert.equal(canEditPersonnel(forged,staff),false);
});
test('Updates reject rank, discordId, dept and other unexpected privileged properties',()=>{
 assert.deepEqual(validatePersonnelChange(payload),payload);
 assert.throws(()=>validatePersonnelChange({...payload,rank:'Commissaris'}));
 assert.throws(()=>validatePersonnelChange({...payload,discordId:'111111111111111111'}));
 assert.throws(()=>validatePersonnelChange({...payload,departments:['politie']}));
 assert.throws(()=>validatePersonnelChange({...payload,status:'Gepromoveerd'}));
 assert.throws(()=>validatePersonnelChange({...payload,reason:'kort'}));
 assert.throws(()=>validatePersonnelChange({...payload,expectedRevision:-1}));
 assert.throws(()=>validatePersonnelChange({...payload,name:'<script>'}));
 assert.equal(EDITABLE_STATUSES.includes('Actief'),true);
});
test('Firestore overlays change only three profile fields and leave protected fields unchanged',()=>{
 const edits=[{dept:'politie',discordId:id,revision:1,name:'Nieuwe naam',call:'931',status:'50/50',rank:'Korpsleiding',personId:'111111111111111111'}];
 const result=mergePersonnelEdits([staff],edits);
 assert.equal(result[0].name,'Nieuwe naam');
 assert.equal(result[0].call,'931');
 assert.equal(result[0].status,'50/50');
 assert.equal(result[0].rank,staff.rank);
 assert.equal(result[0].personId,id);
 assert.equal(result[0].dept,'politie');
 assert.deepEqual(result[0].specialties,staff.specialties);
 assert.equal(staff.name,'UNEMI');
});
test('Invalid and mismatched overrides are silently ignored',()=>{
 const bad=[{dept:'politie',discordId:'333333333333333333',revision:1,name:'x',call:'y',status:'Actief'},
 {dept:'politie',discordId:id,revision:0,name:'x',call:'y',status:'Actief'},
 {dept:'politie',discordId:id,revision:1,name:'x',call:'y',status:'Onmogelijk'}];
 assert.deepEqual(mergePersonnelEdits([staff],bad),[staff]);
});
