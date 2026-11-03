import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roleArtworkCandidateKeys,resolveSpecialtyArtworkKey} from '../src/specialty-artwork-resolver.js';
const CRANE='1562090158667333692';
const SHARED_BW='1309532437952466986';
test('an unlinked role image is detected by exact verified role ID and level',()=>{
 const stage={roleId:CRANE,value:'Stage',assetKey:''};
 assert.deepEqual(roleArtworkCandidateKeys(stage),[CRANE+'_in_opleiding',CRANE+'_standard']);
 const full={roleId:CRANE,value:'Ja',assetKey:''};
 assert.equal(resolveSpecialtyArtworkKey(full,new Set([CRANE+'_standard'])) ,CRANE+'_standard');
 assert.equal(resolveSpecialtyArtworkKey(full,new Set([CRANE+'_volwaardig'])) ,CRANE+'_volwaardig');
 assert.deepEqual(roleArtworkCandidateKeys({roleId:'../../',value:'Ja'}),[]);
});
test('a saved explicit image wins, followed by precise role image, then service fallback',()=>{
 const link={roleId:CRANE,value:'Ja',assetKey:'specialty_depannage_crane'};
 const available=new Set(['specialty_depannage_crane',CRANE+'_standard','patch_depannage_crane']);
 assert.equal(resolveSpecialtyArtworkKey(link,available,['patch_depannage_crane']),link.assetKey);
 assert.equal(resolveSpecialtyArtworkKey({...link,assetKey:''},available,['patch_depannage_crane']),CRANE+'_standard');
 assert.equal(resolveSpecialtyArtworkKey({...link,assetKey:''},new Set(['patch_depannage_crane']),
  ['patch_depannage_crane']),'patch_depannage_crane');
});
test('BW shared LOG/SIG role cannot leak one role badge into both qualifications',()=>{
 const link={roleId:SHARED_BW,value:'Ja',assetKey:''};
 const known=new Set([SHARED_BW+'_standard','specialty_brandweer_signalisatie']);
 assert.equal(resolveSpecialtyArtworkKey(link,known,['specialty_brandweer_signalisatie'],
  {allowRoleFallback:false}),'specialty_brandweer_signalisatie');
 assert.equal(resolveSpecialtyArtworkKey(link,known,[],{allowRoleFallback:false}),'');
});
test('organogram loads exact role-specific slots and retains separate service scoping',()=>{
 const routes=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 assert.match(routes,/roleArtworkCandidateKeys\(x\)/);
 assert.match(routes,/resolveSpecialtyArtworkKey\(x,assetUrls/);
 assert.match(routes,/asset\.get\('department'\)/);
 assert.match(routes,/BW_LOG_SIG_ROLE_ID&&BW_LOG_SIG_SPECIALTIES\.includes\(x\.label\)/);
});
