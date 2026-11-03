import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {depannagePatchCode,depannageProfilePatch} from '../public/service-profile-presentation.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const begin=html.indexOf('let depannageSpecialtyPatchArtworks=new Map();');
const end=html.indexOf('function setServiceUniformData(',begin);
assert.ok(begin>0&&end>begin);
const source=html.slice(begin,end);
function gallery(){
 return runInNewContext(source+
  '\n({setDepannageSpecialtyPatchArtworks,depannageSpecialtyPatchUrl})',
  {depannagePatchCode,depannageProfilePatch});
}
test('Uploaded Depannage patches appear without another mapping step',()=>{
 const api=gallery();
 const url=code=>'/api/role-artwork/file/patch_depannage_'+code+'?v=new-1';
 api.setDepannageSpecialtyPatchArtworks([
  {kind:'patch',department:'depannage',code:'crane',imageUrl:url('crane')},
  {kind:'patch',department:'depannage',code:'fast_badge',imageUrl:url('fast_badge')},
  {kind:'patch',department:'brandweer',code:'lsra',
   imageUrl:'/api/role-artwork/file/patch_brandweer_lsra?v=wrong-1'},
  {kind:'specialty',department:'depannage',code:'lsra',
   imageUrl:'/api/role-artwork/file/specialty_depannage_lsra?v=photo-1'},
  {kind:'patch',department:'depannage',code:'lsra',
   imageUrl:'https://outside.invalid/fake.png'}
 ]);
 assert.equal(api.depannageSpecialtyPatchUrl('CRANE'),url('crane'));
 assert.equal(api.depannageSpecialtyPatchUrl('F.A.S.T'),url('fast_badge'));
 assert.equal(api.depannageSpecialtyPatchUrl('LSRA'),
  '/assets/bpd-depannage-lsra-patch.svg');
 assert.equal(api.depannageSpecialtyPatchUrl('LRSA'),
  '/assets/bpd-depannage-lsra-patch.svg');
});
test('A mapped matching role patch wins over default artwork',()=>{
 const api=gallery(),uploaded='/api/role-artwork/file/patch_depannage_crane?v=library-2';
 const approved='/api/role-artwork/file/patch_depannage_crane_badge?v=choice-2';
 api.setDepannageSpecialtyPatchArtworks([
  {kind:'patch',department:'depannage',code:'crane',imageUrl:uploaded}
 ]);
 assert.equal(api.depannageSpecialtyPatchUrl('CRANE',[{label:'CRANE',imageUrl:approved}]),approved);
 assert.equal(api.depannageSpecialtyPatchUrl('CRANE',[{label:'CRANE',
  imageUrl:'/api/role-artwork/file/patch_ambulance_crane?v=wrong-1'}]),uploaded);
 assert.equal(api.depannageSpecialtyPatchUrl('Wegenwerken'),
  '/assets/bpd-depannage-wegenwerken-patch.svg');
 assert.equal(api.depannageSpecialtyPatchUrl('Unknown'),'');
});
