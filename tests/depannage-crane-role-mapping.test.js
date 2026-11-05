import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROLE_CATALOG,roleSummary} from '../src/role-catalog.js';
import {SPECIALTY_LABELS} from '../src/normalize.js';
import {SPECIALTIES,verifiedSyncRoles} from '../src/organogram-placement-policy.js';
import {defaultSpecialtyRoleLinks,DEPANNAGE_ROLE_PATCH_PRESETS,
 knownDepannageRoleSpecialty,depannageSpecialtyAssetKeys}
 from '../src/specialty-role-presets.js';
import {validateSpecialtyRoleLinks} from '../src/specialty-role-link-routes.js';

const CRANE='1562090158667333692',LSRA='1309532438019706971';
const GUILD='1309532438053130324',NOW=Date.UTC(2026,10,3,5);
const proof=ids=>({guildId:GUILD,verifiedAt:NOW,roleIds:ids});

test('CRANE is a service-scoped Depannage qualification, not membership or management',()=>{
 const entry=ROLE_CATALOG.find(role=>role.id===CRANE);
 assert.ok(entry);
 assert.equal(entry.dept,'depannage');
 assert.equal(entry.kind,'specialisatie');
 assert.equal(roleSummary([CRANE]).departments.includes('depannage'),false);
 assert.equal(roleSummary([CRANE,LSRA]).departments.includes('depannage'),true);
 assert.ok(SPECIALTY_LABELS.depannage.includes('CRANE'));
 assert.ok(SPECIALTIES.depannage.includes('CRANE'));
 assert.deepEqual(verifiedSyncRoles(proof([CRANE]),'depannage',GUILD,NOW).specialties,['CRANE']);
 for(const dept of ['brandweer','politie','ambulance'])
  assert.ok(!verifiedSyncRoles(proof([CRANE]),dept,GUILD,NOW).specialties.includes('CRANE'));
 assert.deepEqual(verifiedSyncRoles(proof([CRANE]),'depannage','wrong-guild',NOW).specialties,[]);
 assert.deepEqual(verifiedSyncRoles({guildId:GUILD,verifiedAt:NOW-8*86400000,roleIds:[CRANE]},
  'depannage',GUILD,NOW).specialties,[]);
});

test('CRANE gets an editable role mapping and distinctly named image slots',()=>{
 const link=DEPANNAGE_ROLE_PATCH_PRESETS.find(x=>x.roleId===CRANE);
 assert.ok(link);
 assert.deepEqual({label:link.label,level:link.level,value:link.value,assetKey:link.assetKey},
  {label:'CRANE',level:'Volwaardig',value:'Ja',assetKey:''});
 assert.equal(knownDepannageRoleSpecialty(CRANE,'CRANE'),true);
 assert.equal(knownDepannageRoleSpecialty(CRANE,'LSRA'),false);
 const defaults=defaultSpecialtyRoleLinks('depannage',[],false);
 assert.equal(defaults.filter(x=>x.roleId===CRANE).length,1);
 assert.deepEqual(defaultSpecialtyRoleLinks('depannage',defaults,false),defaults);
 assert.ok(depannageSpecialtyAssetKeys('CRANE').includes('specialty_depannage_crane'));
 assert.ok(depannageSpecialtyAssetKeys('CRANE').includes('patch_depannage_crane'));
 assert.ok(!depannageSpecialtyAssetKeys('CRANE').some(x=>depannageSpecialtyAssetKeys('LSRA').includes(x)));
});

test('CRANE artwork can be linked without modifying another service',()=>{
 const link={roleId:CRANE,label:'CRANE',level:'Volwaardig',value:'Ja',
  assetKey:'specialty_depannage_crane'};
 const got=validateSpecialtyRoleLinks({
  expectedRevision:0,reason:'Kraanbediening en patch koppelen',links:[link]
 },'depannage',['CRANE'],[{id:CRANE,name:'CRANE'}]);
 assert.deepEqual(got.links,[link]);
 const routes=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 assert.match(routes,/curatedDepannage/);
 assert.match(routes,/depannageSpecialtyAssetKeys\(x.label\)/);
 const api=readFileSync(new URL('../src/specialty-role-link-routes.js',import.meta.url),'utf8');
 assert.match(api,/knownDepannageRoleSpecialty\(x.roleId,x.label\)/);
});
