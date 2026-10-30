import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLibraryUpload,validateLibraryRule,bucketName,
 UNIFORM_LIBRARY_KINDS,UNIFORM_LIBRARY_RULE_KINDS} from '../src/uniform-library-routes.js';

const png=Buffer.alloc(45);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
const upload=(values={})=>({department:'brandweer',kind:'helmet',
 code:'sergeant',label:'Brandweerhelm Sergeant',
 reason:'Nieuwe kwaliteitsafbeelding voor de brandweer',
 dataUrl:'data:image/png;base64,'+png.toString('base64'),...values});
const rule=(values={})=>({department:'brandweer',kind:'helmet',
 scope:'rank',selector:'sergeant',assetCode:'sergeant',
 reason:'Koppeling van helm aan sergeant',...values});

test('uploads are labeled visual data without Discord grants',()=>{
 const value=validateLibraryUpload(upload());
 assert.equal(value.key,'helmet_brandweer_sergeant');
 assert.equal(value.mime,'image/png');
 assert.deepEqual(value.bytes,png);
 assert.equal(Object.hasOwn(value,'roleId'),false);
 assert.ok(UNIFORM_LIBRARY_KINDS.includes('profession'));
 assert.ok(UNIFORM_LIBRARY_KINDS.includes('rank'));
});
test('uploads reject wrong image formats and unknown categories',()=>{
 assert.throws(()=>validateLibraryUpload(upload({department:'invalid'})),/hulpdienst/);
 assert.throws(()=>validateLibraryUpload(upload({kind:'invalid'})),/beeldsoort/);
 assert.throws(()=>validateLibraryUpload(upload({dataUrl:'invalid'})),/PNG/);
 assert.throws(()=>validateLibraryUpload(upload({
  dataUrl:'data:image/jpeg;base64,'+png.toString('base64')})),/afbeeldingsinhoud/);
});
test('assignments cannot award medals or alter personnel privileges',()=>{
 const value=validateLibraryRule(rule());
 assert.equal(value.key,'brandweer_helmet_rank_sergeant');
 assert.equal(Object.hasOwn(value,'permissions'),false);
 assert.equal(UNIFORM_LIBRARY_RULE_KINDS.includes('medal'),false);
 assert.throws(()=>validateLibraryRule(rule({kind:'medal'})),/soort/);
 assert.throws(()=>validateLibraryRule(rule({scope:'person',selector:'500'})),/doelgroep/);
 assert.throws(()=>validateLibraryRule(rule({scope:'service',selector:'sergeant'})),/doelgroep/);
});
test('person mappings and service mappings have distinct stable identifiers',()=>{
 const person=validateLibraryRule(rule({department:'ambulance',kind:'profession',
  scope:'person',selector:'123456789012345678',assetCode:'verpleegkundige'}));
 assert.equal(person.key,'ambulance_profession_person_123456789012345678');
 const service=validateLibraryRule(rule({scope:'service',selector:'default'}));
 assert.equal(service.key,'brandweer_helmet_service_default');
 assert.notEqual(service.key,person.key);
});
test('storage bucket selection uses an explicit per-environment configuration',()=>{
 assert.equal(bucketName({}), '');
 assert.equal(bucketName({BPD_UNIFORM_LIBRARY_BUCKET:'test-asset-bucket'}),'test-asset-bucket');
});
test('the administration page and organogram use the new library modules',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const organogram=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(server,/installUniformLibraryRoutes/);
 assert.match(panel,/id="libraryPanel"/);
 assert.match(panel,/id="libraryAssignmentPanel"/);
 assert.match(organogram,/uniform-library/);
});
