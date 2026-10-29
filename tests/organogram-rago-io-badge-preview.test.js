import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SPECIALTIES,RAGO_IO_DISCORD_ROLE,verifiedSyncRoles,mergePlacement,validatePlacement}
 from '../src/organogram-placement-policy.js';
import {specialtyNames,policeSpecialtyName} from '../public/assets/organogram-hierarchie-model.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const badge=readFileSync(new URL('../public/assets/rago-io-belgische-luchtsteun-geborduurd-20261029.webp',import.meta.url));
const guild='123456789012345678',now=Date.now();
const id=roleIds=>({guildId:guild,verifiedAt:now,roleIds});
const p={dept:'politie',name:'Test',call:'450',rank:'Inspecteur',specialties:[]};
const placement=(extras={})=>({boardRole:'none',leadershipTier:'none',displayOrder:0,
 teachingRoles:[],displayLabels:[],specialties:['RAGO-IO'],
 instructorSpecialties:[],teacherSpecialties:[],reason:'Goedgekeurde opleidingsstatus',
 ...extras});

test('RAGO-IO is a distinct police training role, not a full RAGO qualification',()=>{
 assert.equal(RAGO_IO_DISCORD_ROLE,'1490841316656156802');
 assert.ok(SPECIALTIES.politie.includes('RAGO-IO'));
 const training=verifiedSyncRoles(id([RAGO_IO_DISCORD_ROLE]),'politie',guild,now);
 assert.deepEqual(training.specialties,['RAGO-IO']);
 const full=verifiedSyncRoles(id([RAGO_IO_DISCORD_ROLE,'1309532437977497700']),'politie',guild,now);
 assert.deepEqual(full.specialties,['RAGO']);
 assert.deepEqual(verifiedSyncRoles(id([]),'politie',guild,now).specialties,[]);
 assert.deepEqual(mergePlacement(p,placement(),full).specialties,['RAGO']);
 assert.deepEqual(specialtyNames({...p,specialties:['RAGO-IO']}),['RAGO-IO']);
 assert.equal(policeSpecialtyName('RAGO-IO'),'RAGO-IO');
});
test('manual RAGO-IO selection saves display-only metadata but forbids instructor promotion',()=>{
 assert.deepEqual(validatePlacement(placement(),'politie').specialties,['RAGO-IO']);
 assert.throws(()=>validatePlacement(placement({instructorSpecialties:['RAGO-IO']}),'politie'));
 assert.throws(()=>validatePlacement(placement({teacherSpecialties:['RAGO-IO']}),'politie'));
});
test('badge preview uses matching artwork and does not persist until explicit save',()=>{
 assert.match(html,/id="manage-specialty-preview"/);
 assert.match(html,/id="manage-patch-art"/);
 assert.match(html,/data\.previewSpecialty=specialty/);
 assert.match(html,/show\.addEventListener\('click',\(\)=>refreshAdminBadgePreview\(specialty\)\)/);
 assert.match(html,/entry\.addEventListener\('change',\(\)=>refreshAdminBadgePreview\(specialty\)\)/);
 assert.ok(html.includes("const RAGO_IO_PATCH='/assets/rago-io-belgische-luchtsteun-geborduurd-20261029.webp'"));
 assert.match(html,/patch\.src=RAGO_IO_PATCH/);
 assert.match(html,/img\.src=RAGO_IO_PATCH/);
 assert.match(html,/id="k9-badge-preview"/);
 assert.match(html,/k9-patch-preview role-/);
 assert.match(html,/role-geleider_in_stage\{background-position:50% 100%\}/);
 assert.match(html,/Voor deze specialisatie is nog geen officiële patch gekoppeld/);
 assert.match(html,/if\(p\.dept==='politie'&&supportsSpecialtyInstructors\(specialty\)\)/);
 assert.doesNotMatch(html,/fetch\(RAGO_IO_PATCH/);
});
test('approved embroidered WebP replaces the incorrect vector illustration everywhere',()=>{
 assert.equal(badge.subarray(0,4).toString('ascii'),'RIFF');
 assert.equal(badge.subarray(8,12).toString('ascii'),'WEBP');
 assert.ok(badge.length>4000);
 assert.ok(html.includes('/assets/rago-io-belgische-luchtsteun-geborduurd-20261029.webp'));
 assert.ok(!html.includes('/assets/rago-io-belgische-luchtsteun-20261029.svg'));
 assert.match(html,/patch\\.src=RAGO_IO_PATCH/);
 assert.match(html,/img\\.src=RAGO_IO_PATCH/);
});
