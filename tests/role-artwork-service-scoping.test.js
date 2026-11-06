import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROLE_CATALOG} from '../src/role-catalog.js';
import {roleArtworkChoices,artworkCodeChoices} from '../public/role-artwork-ui.js';

const chosen=dept=>roleArtworkChoices(dept,ROLE_CATALOG).map(x=>x.roleId);
const codes=dept=>artworkCodeChoices(dept,'specialty').map(x=>x[0]);

test('Dienstrolkeuzelijst gebruikt de centrale Discord-catalogus per geselecteerde hulpdienst',()=>{
 const police=chosen('politie'),fire=chosen('brandweer');
 const ambulance=chosen('ambulance'),depannage=chosen('depannage'),burger=chosen('burger');
 assert.ok(police.includes('1309532438053130326'));
 assert.ok(police.includes('1337852029611016233')); // Dispatch onder politie
 assert.ok(!police.includes('1309532438053130324'));
 assert.ok(fire.includes('1309532438053130324'));
 assert.ok(fire.includes('1399000349037166664'));
 assert.ok(!fire.includes('1309532438053130323'));
 assert.ok(ambulance.includes('1309532438053130323'));
 assert.ok(ambulance.includes('1360990813357609181'));
 assert.ok(!ambulance.includes('1309532438019706970'));
 assert.ok(depannage.includes('1309532438019706971')); // LSRA
 assert.ok(depannage.includes('1309532438019706970')); // FAST
 assert.ok(depannage.includes('1562090158667333692')); // CRANE
 assert.ok(burger.includes('1492485336197234728')); // Burgerraad
});
test('Bestaande aangepaste roltitels blijven beperkt tot hun hulpdienst',()=>{
 const artwork={kind:'role',department:'brandweer',roleId:'1399000349037166664',
  variant:'instructeur',label:'Ladderwagen instructeur'};
 const fire=roleArtworkChoices('brandweer',ROLE_CATALOG,[artwork]);
 const police=roleArtworkChoices('politie',ROLE_CATALOG,[artwork]);
 assert.ok(fire.some(x=>x.roleId===artwork.roleId&&x.variant==='instructeur'));
 assert.ok(!police.some(x=>x.roleId===artwork.roleId));
});
test('Dienstspecifieke specialisatiecodes mengen geen politiebadges met AZLS of Depannage',()=>{
 assert.ok(codes('politie').includes('motard'));
 assert.ok(!codes('ambulance').includes('motard'));
 assert.ok(codes('ambulance').includes('mug_heli'));
 assert.ok(!codes('depannage').includes('mug_heli'));
 assert.ok(codes('depannage').includes('crane'));
 assert.ok(codes('brandweer').includes('duiker'));
 assert.ok(!codes('politie').includes('duiker'));
 const custom=[{kind:'specialty',department:'ambulance',code:'extra_medisch',
  label:'Extra medisch'}];
 assert.ok(artworkCodeChoices('ambulance','specialty',custom).some(([code])=>code==='extra_medisch'));
 assert.ok(!artworkCodeChoices('brandweer','specialty',custom).some(([code])=>code==='extra_medisch'));
});
test('Beheerpagina vraagt alleen dienstspecifieke afbeeldingen en houdt backend-toegangscontrole intact',()=>{
 const client=readFileSync(new URL('../public/role-artwork-ui.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/role-artwork-routes.js',import.meta.url),'utf8');
 assert.match(client,/row\.department===department/);
 assert.match(client,/editableDepartments\.includes\(department\)/);
 assert.match(client,/roleArtworkRoleId'\)\.value=''/);
 assert.match(server,/editableDepartments:DEPTS\.filter\(dept=>mayEditDepartment/);
 assert.match(server,/roleOptions:ROLE_CATALOG/);
 assert.match(server,/if\(!mayEditDepartment\(req\.bpd,input\.department\)\)/);
});
