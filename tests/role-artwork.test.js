import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRoleArtwork} from '../src/role-artwork-routes.js';

const base={
 roleId:'1358148694297415741',variant:'standard',
 label:'MOTARD · Volwaardig',reason:'Geborduurde versie goedgekeurd'
};
const make=changes=>({...base,...changes});
test('role-logo editor rejects arbitrary executable or external artwork',()=>{
 assert.throws(()=>validateRoleArtwork(make({dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'})),/WebP/);
 assert.throws(()=>validateRoleArtwork(make({dataUrl:'https://example.org/x.webp'})),/WebP/);
 assert.throws(()=>validateRoleArtwork(make({dataUrl:'data:text/html;base64,PHNjcmlwdD4='})),/WebP/);
});
test('role-logo editor validates Discord IDs, variants and reason',()=>{
 assert.throws(()=>validateRoleArtwork(make({roleId:'../admin'})),/Discord/);
 assert.throws(()=>validateRoleArtwork(make({variant:'../admin'})),/Discord/);
 assert.throws(()=>validateRoleArtwork(make({reason:'kort'})),/Motivering/);
 assert.throws(()=>validateRoleArtwork(make({label:'<img onerror=alert(1)>'})),/Naam/);
});
test('role-logo editor enforces image signatures and size',()=>{
 const fake=Buffer.from('this is not a WebP').toString('base64');
 assert.throws(()=>validateRoleArtwork(make({dataUrl:'data:image/webp;base64,'+fake})),/Ongeldige/);
 const huge=Buffer.alloc(140*1024+1,0);
 huge.write('RIFF',0);huge.write('WEBP',8);huge.writeUInt32LE(huge.length-8,4);
 assert.throws(()=>validateRoleArtwork(make({dataUrl:'data:image/webp;base64,'+huge.toString('base64')})),/140 KB/);
});
test('role-logo slot is a role ID plus display variant, not a permission',()=>{
 const fixture=readFileSync(new URL('../public/assets/k9-patches-geborduurd-20261029.webp',import.meta.url));
 const result=validateRoleArtwork(make({dataUrl:'data:image/webp;base64,'+fixture.toString('base64')}));
 assert.equal(result.key,'1358148694297415741_standard');
 assert.equal(result.roleId,base.roleId);
 assert.equal(Object.hasOwn(result,'permissions'),false);
});
