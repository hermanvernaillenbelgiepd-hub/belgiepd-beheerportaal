import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_CATALOG} from '../src/role-catalog.js';
import {POLICE_ROLE_PATCH_PRESETS,defaultSpecialtyRoleLinks} from '../src/specialty-role-presets.js';
import {automaticPoliceSpecialties,publicSpecializations,allowedSpecialty,
 initialFixedCallSpecialties,applyVerifiedSpecialtyRoleDisplay} from '../src/specialization-policy.js';

const roles={
 '1345297414612979713':'K9','1309532437977497699':'K9',
 '1345302115689431061':'K9',
 '1337852029611016233':'Dispatch','1309532438019706963':'Dispatch',
 '1393050971604516904':'Dispatch','1309542190409580594':'AE',
 '1310674604821581894':'AE','1337775768083632158':'AE',
 '1337156006597103746':'AE','1490841316656156802':'RAGO',
 '1309532437977497700':'RAGO','1393050551188721865':'RAGO',
 '1365602771855740958':'Motor','1358148694297415741':'Motor',
 '1359656762289946755':'Motor','1309532438019706962':'Terreinondersteuner'
};
const police=call=>({dept:'politie',personId:'123456789012345678',call,
 specialties:[{label:'SIV/WPR',value:'Nee'},{label:'Signalisatie',value:'Nee'},
 {label:'Semi-ano.',value:'Nee'}]});
const status=(subject,label,doc)=>publicSpecializations(subject,doc).items.find(x=>x.label===label);

test('confirmed Discord role IDs map once to a single qualification and level',()=>{
 assert.equal(POLICE_ROLE_PATCH_PRESETS.length,17);
 assert.deepEqual(Object.fromEntries(POLICE_ROLE_PATCH_PRESETS.map(x=>[x.roleId,x.label])),roles);
 assert.equal(new Set(POLICE_ROLE_PATCH_PRESETS.map(x=>x.roleId)).size,17);
 for(const preset of POLICE_ROLE_PATCH_PRESETS){
  assert.equal(ROLE_CATALOG.some(x=>x.id===preset.roleId),true,preset.roleId);
  assert.equal(preset.assetKey,'');
 }
 assert.equal(POLICE_ROLE_PATCH_PRESETS.find(x=>x.roleId==='1490841316656156802').level.includes('halve wing'),true);
 assert.equal(POLICE_ROLE_PATCH_PRESETS.find(x=>x.roleId==='1337775768083632158').value,'LEIDING');
 assert.equal(POLICE_ROLE_PATCH_PRESETS.find(x=>x.roleId==='1393050551188721865').value,'INSTRUCTEUR');
});
test('existing curated mappings are never overwritten by presets',()=>{
 const custom=[{label:'AE',roleId:'1310674604821581894',level:'Eigen tekst',value:'Ja',assetKey:''}];
 assert.deepEqual(defaultSpecialtyRoleLinks('politie',custom,true),custom);
 const upgraded=defaultSpecialtyRoleLinks('politie',custom,false);
 assert.equal(upgraded.length,17);
 assert.equal(upgraded[0].level,'Eigen tekst');
 assert.equal(upgraded.filter(x=>x.roleId===custom[0].roleId).length,1);
 assert.equal(defaultSpecialtyRoleLinks('politie',[],false).length,17);
 const fireLinks=defaultSpecialtyRoleLinks('brandweer',[],false);
 assert.deepEqual(fireLinks.map(x=>x.label),['Logistiek','Signalisatie',
  'Ladderwagen','Bosbestrijding','Duiker','RED team','Gevaarlijke stoffen']);
 assert.equal(fireLinks.filter(x=>x.roleId==='1309532437952466986').length,2);
});
test('automatic privileges start at fixed callsign, A-INP and INP thresholds',()=>{
 for(const call of ['101','199','008','—','P-199']){
  assert.deepEqual(automaticPoliceSpecialties(police(call)),{});
 }
 for(const call of ['200','P-299']){
  assert.equal(status(police(call),'Burgermeldingen').value,'Ja');
  assert.equal(status(police(call),'SIV/WPR').value,'Ja');
  assert.equal(status(police(call),'Signalisatie').value,'Nee');
  assert.equal(status(police(call),'Semi-ano.').value,'Nee');
 }
 for(const call of ['P-300','399']){
  assert.equal(status(police(call),'Signalisatie').value,'Ja');
  assert.equal(status(police(call),'Semi-ano.').value,'Nee');
 }
 for(const call of ['S-400','500','930']){
  assert.equal(status(police(call),'Signalisatie').value,'Ja');
  assert.equal(status(police(call),'Semi-ano.').value,'Ja');
 }
 assert.equal(status({dept:'ambulance',call:'500'},'Burgermeldingen'),undefined);
});
test('authorized manual restriction overrides call-based defaults',()=>{
 const document={revision:4,values:{
  'Burgermeldingen':{value:'Nee',source:'manual'},
  'Signalisatie':{value:'Stage',source:'manual'},
  'Semi-ano.':{value:'Nee',source:'manual'}
 }};
 const member=police('420');
 assert.equal(status(member,'Burgermeldingen',document).value,'Nee');
 assert.equal(status(member,'Signalisatie',document).value,'Stage');
 assert.equal(status(member,'Semi-ano.',document).value,'Nee');
 assert.equal(status(member,'Signalisatie',document).source,'manual');
 assert.equal(status(member,'SIV/WPR').source,'automatic-call');
});
test('new police status labels are native even without Sheets columns',()=>{
 assert.equal(allowedSpecialty('politie','Burgermeldingen'),true);
 assert.equal(allowedSpecialty('politie','Terreinondersteuner'),true);
 assert.equal(allowedSpecialty('ambulance','Burgermeldingen'),false);
 const defaults=initialFixedCallSpecialties({discordId:'123456789012345678',status:'approved',
  assignedCall:230,sync:{call:230,discordId:'123456789012345678'}});
 assert.equal(defaults['Burgermeldingen'].value,'Ja');
 assert.equal(initialFixedCallSpecialties({discordId:'123456789012345678',status:'verified',
  assignedCall:230,sync:{call:230,discordId:'123456789012345678'}}),null);
});

test('verified Discord roles project only visual levels; manual restrictions win',()=>{
 const id='123456789012345678',state=publicSpecializations(police('430'),{
  values:{AE:{value:'Nee',source:'manual'}}
 });
 const links=[
  {roleId:'1309542190409580594',label:'AE',value:'Stage',level:'AE-I'},
  {roleId:'1337156006597103746',label:'AE',value:'INSTRUCTEUR',level:'Instructeur'},
  {roleId:'1358148694297415741',label:'Motor',value:'Ja',level:'Volwaardig'}
 ];
 applyVerifiedSpecialtyRoleDisplay(state,[
  '1309542190409580594','1337156006597103746','1358148694297415741'
 ],links);
 assert.equal(state.items.find(x=>x.label==='AE').value,'Nee');
 assert.equal(state.items.find(x=>x.label==='AE').source,'manual');
 assert.equal(state.items.find(x=>x.label==='Motor').value,'Ja');
 assert.equal(state.items.find(x=>x.label==='Motor').source,'discord-verified');
 const noProof=publicSpecializations(police('430'),null);
 applyVerifiedSpecialtyRoleDisplay(noProof,['not-valid'],links);
 assert.notEqual(noProof.items.find(x=>x.label==='Motor').source,'discord-verified');
});

test('each known Fire specialization role maps to its exact unique label and patch',()=>{
 const fire=defaultSpecialtyRoleLinks('brandweer',[],false);
 for(const [roleId,label] of [
  ['1399000349037166664','Ladderwagen'],
  ['1399006120965570670','Bosbestrijding'],
  ['1309532437952466985','Duiker'],
  ['1399000449457197188','RED team'],
  ['1309532437952466987','Gevaarlijke stoffen']]){
  assert.deepEqual(fire.filter(x=>x.roleId===roleId).map(x=>x.label),[label]);
 }
 const custom=[{...fire[2],label:'Ladderwagen',level:'Eigen niveau'}];
 const withCustom=defaultSpecialtyRoleLinks('brandweer',custom,false);
 assert.equal(withCustom.find(x=>x.roleId===custom[0].roleId).level,'Eigen niveau');
 assert.equal(withCustom.filter(x=>x.roleId===custom[0].roleId).length,1);
});
