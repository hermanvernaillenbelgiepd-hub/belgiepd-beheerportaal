import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mayUseTestCleanup,validCleanupScope,recognizedTestMarker,canCleanupRecord,
  cleanupRecordState,validateCleanupCommand
} from '../src/technical-test-cleanup-policy.js';

const id='123456789012345678';
const other='223456789012345678';
const technical={discordId:id,uid:'discord:'+id,role:'beheerder',
  portalTechnicalMode:true,profileTechnicalAvailable:true};

test('only independently verified technical beheer has cleanup access',()=>{
  assert.equal(mayUseTestCleanup(technical),true);
  for(const x of [
    {...technical,portalTechnicalMode:false},
    {...technical,profileTechnicalAvailable:false},
    {...technical,role:'korpsleiding'},
    {...technical,role:'officierenkader'},
    {...technical,uid:'discord:'+other},
    {...technical,uid:'google:account'},
    null
  ])assert.equal(mayUseTestCleanup(x),false);
});

test('scope never permits leave, weekreports, personnel or cross-service entries',()=>{
  assert.equal(validCleanupScope('burger',id,'citizen'),true);
  assert.equal(validCleanupScope('politie',id,'cases'),true);
  assert.equal(validCleanupScope('ambulance',id,'staff'),true);
  for(const [dept,source] of [
    ['burger','cases'],['politie','citizen'],
    ['politie','leave'],['burger','weekreport'],['bestuur','staff']
  ])assert.equal(validCleanupScope(dept,id,source),false);
  assert.equal(validCleanupScope('burger','not-an-id','citizen'),false);
});

test('test marker must be explicit at start, never incidental in official content',()=>{
  for(const text of ['TEST','test test','TEST: proefnotitie',
    '[TEST] tijdelijke registratie','[DEMO] rolcontrole','PROEF: testentry'])
    assert.equal(recognizedTestMarker(text),true,text);
  for(const text of ['Officiële registratie over testprocedures',
    'Resultaat van medische test', 'Een test uitgevoerd als oefening',
    'Geteste procedure','','Dienstoverdracht',null])
    assert.equal(recognizedTestMarker(text),false,String(text));
});

test('only whitelisted, marked dossier records can be retired',()=>{
  assert.equal(canCleanupRecord('citizen',{kind:'observatie',details:'test test'}),true);
  assert.equal(canCleanupRecord('citizen',{kind:'notitie',details:'[TEST] demo'}),true);
  assert.equal(canCleanupRecord('citizen',{kind:'sanctie_schriftelijk',
    details:'Officiële schriftelijke sanctie'}),false);
  assert.equal(canCleanupRecord('citizen',{kind:'observatie',
    details:'Een opleiding test uitvoeren'}),false);
  assert.equal(canCleanupRecord('citizen',{kind:'volwaardig',testData:true}),true);
  assert.equal(canCleanupRecord('citizen',{kind:'leave',details:'TEST'}),false);
  assert.equal(canCleanupRecord('staff',{kind:'administratief',details:'TEST'}),true);
  assert.equal(canCleanupRecord('staff',{kind:'onbekend',details:'TEST'}),false);
  assert.equal(canCleanupRecord('cases',{type:'notitie',details:'TEST: 123'}),true);
  assert.equal(canCleanupRecord('cases',{type:'observatie',title:'[TEST] score'}),true);
  assert.equal(canCleanupRecord('cases',{type:'activiteit',details:'TEST: 123'}),false);
  assert.equal(canCleanupRecord('cases',{type:'notitie',details:'TEST',
    source:'central-leave-audit'}),false);
  assert.equal(canCleanupRecord('weekreport',{kind:'notitie',details:'TEST'}),false);
});

test('only cleanup-owned retirements can be restored',()=>{
  assert.equal(cleanupRecordState('citizen',{kind:'notitie'}),'active');
  assert.equal(cleanupRecordState('cases',{type:'notitie',status:'verwijderd'}),'other-retired');
  assert.equal(cleanupRecordState('citizen',{deletedAt:new Date()}),'other-retired');
  assert.equal(cleanupRecordState('citizen',{deletedAt:new Date(),cleanup:{
    marker:'technical-test-cleanup',state:'withdrawn'}}),'withdrawn');
  assert.equal(cleanupRecordState('staff',{status:'verwijderd',retired:{at:new Date()},
    cleanup:{marker:'other-cleanup',state:'withdrawn'}}),'other-retired');
});

test('strict single-entry command requires the typed confirmation and reason',()=>{
  const good={dept:'burger',discordId:id,source:'citizen',entryId:'abcdef1234567890',
    reason:'Overbodige proefregistratie uit een eerdere test',confirm:'INTREKKEN'};
  assert.deepEqual(validateCleanupCommand(good,'withdraw'),{
    dept:good.dept,discordId:id,source:'citizen',
    entryId:good.entryId,reason:good.reason
  });
  assert.deepEqual(validateCleanupCommand({...good,confirm:'HERSTELLEN'},'restore'),{
    dept:good.dept,discordId:id,source:'citizen',
    entryId:good.entryId,reason:good.reason
  });
  for(const bad of [
    {...good,confirm:'VERWIJDEREN'}, {...good,reason:'kort'},
    {...good,reason:'x'.repeat(501)}, {...good,dept:'politie'},
    {...good,source:'leave'}, {...good,entryId:'??'},
    {...good,all:true},{...good,reason:'Proefregistratie\u0000 ongeldig'}
  ])assert.throws(()=>validateCleanupCommand(bad,'withdraw'));
  assert.throws(()=>validateCleanupCommand(null,'withdraw'));
});
