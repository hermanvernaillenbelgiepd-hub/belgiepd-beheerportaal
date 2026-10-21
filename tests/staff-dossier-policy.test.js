import test from 'node:test';
import assert from 'node:assert/strict';
import {STAFF_DOSSIER_COLLECTION,STAFF_NOTE_TYPES,staffDossierEnabled,staffDossierWritesEnabled,
  staffDossierId,uniqueStaffSubject,canReadStaffDossier,canMaintainStaffDossier,
  normalizeStaffProfile,validateStaffProfile,publicStaffNote}
  from '../src/staff-dossier-policy.js';

const id='123456789012345678',other='987654321098765432';
const member={personId:id,dept:'politie',rank:'Agent',name:'Test Agent',call:'P-4'};
const leader={role:'korpsleiding',departments:['politie'],
  departmentRoles:{politie:'korpsleiding'},discordId:other};
const ambulance={role:'korpsleiding',departments:['ambulance'],
  departmentRoles:{ambulance:'korpsleiding'},discordId:other};

test('New staff dossier paths are department-scoped and disabled by default',()=>{
  assert.equal(STAFF_DOSSIER_COLLECTION,'bpd_staff_dossiers');
  assert.equal(staffDossierEnabled({}),false);
  assert.equal(staffDossierWritesEnabled({BPD_ENABLE_STAFF_DOSSIER_WRITES:'true'}),false);
  assert.equal(staffDossierEnabled({BPD_ENABLE_STAFF_DOSSIERS:'true'}),true);
  assert.equal(staffDossierWritesEnabled({BPD_ENABLE_STAFF_DOSSIERS:'true',
    BPD_ENABLE_STAFF_DOSSIER_WRITES:'true'}),true);
  assert.equal(staffDossierId('politie',id),'politie_'+id);
  assert.equal(staffDossierId('ambulance',id),'ambulance_'+id);
  assert.throws(()=>staffDossierId('onbekend',id));
  assert.throws(()=>staffDossierId('politie','not-a-real-id'));
});
test('Personnel dossier never authorises cross-service staff access',()=>{
  assert.equal(canReadStaffDossier(leader,member),true);
  assert.equal(canMaintainStaffDossier(leader,member),true);
  assert.equal(canReadStaffDossier(ambulance,member),false);
  assert.equal(canMaintainStaffDossier(ambulance,member),false);
  assert.equal(canMaintainStaffDossier({...leader,discordId:id},member),false);
  assert.equal(canReadStaffDossier({role:'basiskader',departments:['politie'],
    departmentRoles:{politie:'basiskader'}},member),false);
});
test('Ambiguous or absent personnel reference cannot create a dossier',()=>{
  assert.deepEqual(uniqueStaffSubject([member],member.dept,id),member);
  assert.equal(uniqueStaffSubject([],member.dept,id),null);
  assert.equal(uniqueStaffSubject([member,member],member.dept,id),null);
  assert.equal(uniqueStaffSubject([member],'ambulance',id),null);
  assert.equal(uniqueStaffSubject([member],member.dept,other),null);
});
test('Profile updates demand complete fields, reason, and concurrency revision',()=>{
  const valid={profile:{startDate:'2026-10-20',unit:'Ploeg 01',
    functionTitle:'Terreinondersteuner'},expectedRevision:0,
    reason:'Aanstellingsgegevens geverifieerd door het bevoegde kaderlid'};
  assert.deepEqual(validateStaffProfile(valid),valid);
  assert.deepEqual(normalizeStaffProfile(null),{startDate:'',unit:'',functionTitle:''});
  assert.throws(()=>validateStaffProfile({...valid,expectedRevision:-1}));
  assert.throws(()=>validateStaffProfile({...valid,expectedRevision:1.5}));
  assert.throws(()=>validateStaffProfile({...valid,extraRole:'admin'}));
  assert.throws(()=>validateStaffProfile({...valid,reason:'kort'}));
  assert.throws(()=>validateStaffProfile({...valid,profile:{...valid.profile,
    startDate:'2026-02-30'}}));
  assert.throws(()=>validateStaffProfile({...valid,profile:{...valid.profile,
    unit:'<script>'}}));
  assert.throws(()=>validateStaffProfile({...valid,profile:{...valid.profile,
    rank:'Hoofdinspecteur'}}));
  assert.throws(()=>validateStaffProfile({...valid,profile:{unit:'Ploeg 1'}}));
});
test('Historical note categories remain readable without allowing a second writer',()=>{
  assert.ok(STAFF_NOTE_TYPES.includes('opleiding'));
  assert.ok(STAFF_NOTE_TYPES.includes('evaluatie'));
  assert.ok(STAFF_NOTE_TYPES.includes('administratief'));
});
test('Public notes expose only allowed fields and never internal uid or secrets',()=>{
  const n=publicStaffNote({kind:'opleiding',title:'Afgeronde instructie',
    details:'Opgeleid en besproken tijdens functioneringsgesprek.',
    authorDiscordId:other,authorUid:'internal-private-id',
    createdAt:new Date('2026-10-20T12:00:00Z'),secretToken:'NEVER'},
    'aBcD0123');
  assert.deepEqual(n,{id:'aBcD0123',kind:'opleiding',
    title:'Afgeronde instructie',details:'Opgeleid en besproken tijdens functioneringsgesprek.',
    authorDiscordId:other,recordedAt:'2026-10-20T12:00:00.000Z'});
  assert.equal(publicStaffNote({kind:'private',details:'secret'},'id'),null);
});


test('Same Discord user may have independent service dossiers that department managers cannot cross',()=>{
  const police={...member,dept:'politie',call:'S312',rank:'Inspecteur'};
  const med={...member,dept:'ambulance',call:'AMB-5',rank:'Ambulancier'};
  assert.notEqual(staffDossierId(police.dept,id),staffDossierId(med.dept,id));
  assert.equal(canReadStaffDossier(leader,police),true);
  assert.equal(canMaintainStaffDossier(leader,med),false);
  assert.equal(canReadStaffDossier(leader,med),false);
  assert.equal(canReadStaffDossier(ambulance,police),false);
  assert.equal(canReadStaffDossier(ambulance,med),true);
  assert.equal(canMaintainStaffDossier(ambulance,med),true);
  assert.equal(uniqueStaffSubject([police,med],'politie',id)?.call,'S312');
  assert.equal(uniqueStaffSubject([police,med],'ambulance',id)?.call,'AMB-5');
});
