import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serviceProfileRank,depannagePatchCode,depannageProfilePatch} from '../public/service-profile-presentation.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Depannage never inherits an ambulance rank on its profile',()=>{
 const p={name:'Belgamods',call:'—',rank:'Ambulancier'};
 assert.equal(serviceProfileRank({...p,dept:'depannage'}),'Operationeel lid Depannage');
 assert.equal(serviceProfileRank({...p,dept:'ambulance'}),'Ambulancier');
 assert.equal(serviceProfileRank({dept:'depannage',call:'LSRA-05',rank:'Arts'}),'LSRA-medewerker');
 assert.equal(serviceProfileRank({dept:'depannage',call:'FAST-01',rank:'Arts'}),'F.A.S.T.-medewerker');
 assert.equal(serviceProfileRank({dept:'depannage',call:'AWV-01',rank:'Arts'}),'Leiding · Agentschap Wegen en Verkeer');
 assert.equal(serviceProfileRank({dept:'depannage',rank:'Depannagetechnicus'}),'Depannagetechnicus');
});
test('every known towing specialty gets an actual vector badge',()=>{
 for(const [label,code] of [['F.A.S.T','fast'],['LSRA','lsra'],['CRANE','crane'],
  ['Wegenwerken','wegenwerken'],['Signalisatie','signalisatie']]){
  assert.equal(depannagePatchCode(label),code);
  assert.equal(depannageProfilePatch(label),'/assets/bpd-depannage-'+code+'-patch.svg');
  assert.match(src('public/assets/bpd-depannage-'+code+'-patch.svg'),/viewBox="0 0 640 200"/);
 }
});
test('only a dedicated same-service uploaded patch can replace the vector',()=>{
 const old='/api/role-artwork/file/specialty_depannage_fast?v=old-1';
 const role='/api/role-artwork/file/1309532438019706970_standard?v=old-1';
 const approved='/api/role-artwork/file/patch_depannage_fast_badge?v=approved-1';
 const cross='/api/role-artwork/file/patch_ambulance_fast_badge?v=bad-1';
 const entries=[old,role,cross,approved].map(imageUrl=>({label:'F.A.S.T',imageUrl}));
 assert.equal(depannageProfilePatch('F.A.S.T',entries),approved);
 assert.equal(depannageProfilePatch('F.A.S.T',entries.slice(0,3)),
  '/assets/bpd-depannage-fast-patch.svg');
 assert.equal(depannageProfilePatch('LSRA',entries),'/assets/bpd-depannage-lsra-patch.svg');
});
test('operational profile uses service-locked labels, uniforms and badges',()=>{
 const html=src('public/organogram-hierarchie.html'),css=src('public/organogram-hybrid.css');
 assert.match(html,/serviceProfileRank\(p\)/);
 assert.match(html,/depannageProfilePatch\(name,p\.specialtyPatches\)/);
 assert.match(html,/serviceUniformArtworks\.get\(key\)/);
 assert.match(html,/depannage-person-profile/);
 assert.match(css,/img\.depannage-specialty-badge/);
});
