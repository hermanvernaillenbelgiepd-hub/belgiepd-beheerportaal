import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 AMBULANCE_ROLE_PATCH_PRESETS,AZLS_PIT_MOTOR_ROLE_ID,AZLS_FUNCTION_ROLES,
 verifiedAzlsFunctions,ambulanceSpecialtyAssetKeys,knownAmbulanceRoleSpecialty,
 defaultSpecialtyRoleLinks
} from '../src/specialty-role-presets.js';
import {verifiedSyncRoles} from '../src/organogram-placement-policy.js';
import {ROLE_CATALOG} from '../src/role-catalog.js';
import {allSpecialtyLabels} from '../src/specialization-policy.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const guild='111111111111111111',now=Date.now();
const identity=roleIds=>({guildId:guild,verifiedAt:now,roleIds});

test('each AZLS qualification is derived from an exact verified Discord role ID',()=>{
 assert.deepEqual(AMBULANCE_ROLE_PATCH_PRESETS.map(x=>x.label),['MIP','HELI','PIT-MOTOR']);
 assert.deepEqual(AMBULANCE_ROLE_PATCH_PRESETS.map(x=>x.roleId),[
  '1360990854445137980','1360990813357609181','1508506242299985980'
 ]);
 assert.ok(ROLE_CATALOG.some(x=>x.id===AZLS_PIT_MOTOR_ROLE_ID));
 assert.ok(allSpecialtyLabels('ambulance').includes('PIT-MOTOR'));
 const preset=defaultSpecialtyRoleLinks('ambulance',[],false);
 assert.deepEqual(preset.map(x=>x.label),['MIP','HELI','PIT-MOTOR']);
 const manual=[{...preset[0],assetKey:'specialty_ambulance_mip',level:'Eigen niveau'}];
 const merged=defaultSpecialtyRoleLinks('ambulance',manual,false);
 assert.equal(merged[0].assetKey,manual[0].assetKey);
 assert.equal(merged[0].level,'Eigen niveau');
 assert.equal(merged.length,3);
 assert.ok(knownAmbulanceRoleSpecialty('1508506242299985980','PIT-MOTOR'));
 assert.equal(knownAmbulanceRoleSpecialty('1508506242299985980','MIP'),false);
});
test('medical instructor is a function, not proof of MIP clinical training',()=>{
 const functions=verifiedAzlsFunctions(identity([
  '1309532438053130325','1309532437977497695',
  '1309532437977497696','1309532437952466988'
 ]),guild,now);
 assert.deepEqual(functions,['AZLS Leiding','Arts','Verpleegkundige','Medisch Instructeur']);
 const synced=verifiedSyncRoles(identity(['1309532437952466988']),'ambulance',guild,now);
 assert.deepEqual(synced.specialties,[]);
 assert.deepEqual(synced.instructorSpecialties,[]);
 assert.deepEqual(synced.teachingRoles,['instructeur']);
 assert.equal(synced.boardRole,'none');
 assert.deepEqual(verifiedAzlsFunctions(identity(['1309532437952466988']),'222222222222222222',now),[]);
 assert.equal(verifiedAzlsFunctions(identity(['1309532437952466988']),'111111111111111111',now+8*86400000).length,0);
 assert.equal(AZLS_FUNCTION_ROLES.length,4);
});
test('AZLS member image resolver selects its own MIP, HELI, and PIT-MOTOR patch keys',()=>{
 for(const [label,key] of [
  ['MIP','specialty_ambulance_mip'],
  ['HELI','specialty_ambulance_mug_heli'],
  ['PIT-MOTOR','specialty_ambulance_pit_motor']
 ]){
  assert.ok(ambulanceSpecialtyAssetKeys(label).includes(key),label);
 }
 assert.ok(ambulanceSpecialtyAssetKeys('Ladderwagen').length===0);
 const routes=read('src/organogram-placement-routes.js');
 assert.match(routes,/knownAmbulanceRoleSpecialty\(x\.roleId,x\.label\)/);
 assert.match(routes,/ambulanceSpecialtyAssetKeys\(x\.label\)/);
 assert.match(routes,/verifiedAzlsFunctions\(roles\.entries\.get\(p\.personId\)/);
 assert.match(routes,/cachedOAuthRoles,upstream/);
 const linkRoutes=read('src/specialty-role-link-routes.js');
 assert.match(linkRoutes,/dept==='ambulance'&&x\.id==='1508506242299985980'/);
 const html=read('public/organogram-hierarchie.html');
 assert.match(html,/Aanvullende Discord-functies/);
 assert.match(html,/matchedArtwork\?\.imageUrl\|\|ambulanceSpecialtyPatchUrl\(name\)/);
 assert.match(html,/azlsFunctions:p\.dept==='ambulance'/);
});
test('unrelated medical professional roles do not claim medical-specialization badges',()=>{
 for(const [,name] of AZLS_FUNCTION_ROLES){
  assert.equal(AMBULANCE_ROLE_PATCH_PRESETS.some(x=>x.label===name),false);
 }
});
