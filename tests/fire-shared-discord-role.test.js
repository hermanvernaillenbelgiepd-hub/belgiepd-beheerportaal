import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROLE_CATALOG} from '../src/role-catalog.js';
import {SPECIALTY_STATES} from '../src/specialization-policy.js';
import {
 BW_LOG_SIG_ROLE_ID,BW_LOG_SIG_SPECIALTIES,BW_LOG_SIG_PRESETS,
 fireSharedSpecialtyAssetKeys,defaultSpecialtyRoleLinks
} from '../src/specialty-role-presets.js';
import {validateSpecialtyRoleLinks} from '../src/specialty-role-link-routes.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const labelList=['Logistiek','Signalisatie','Ladderwagen','RED team'];
const roleList=[
 {id:BW_LOG_SIG_ROLE_ID,name:'BW log/signa'},
 {id:'1399000349037166664',name:'Ladderwagen'}
];
const pair=defaultSpecialtyRoleLinks('brandweer',[],false).filter(x=>x.roleId===BW_LOG_SIG_ROLE_ID);
const input=links=>({expectedRevision:0,reason:'Koppel beide Brandweer-specialisaties',links});

test('BW log/signa exists in real Discord catalog and expands into exactly two visual qualifications',()=>{
 const role=ROLE_CATALOG.find(x=>x.id===BW_LOG_SIG_ROLE_ID);
 assert.ok(role);
 assert.equal(role.dept,'brandweer');
 assert.equal(role.kind,'specialisatie');
 assert.deepEqual(BW_LOG_SIG_SPECIALTIES,['Logistiek','Signalisatie']);
 assert.deepEqual(pair.map(x=>x.label),BW_LOG_SIG_SPECIALTIES);
 assert.ok(pair.every(x=>x.roleId===BW_LOG_SIG_ROLE_ID&&x.assetKey===''&&x.value==='Ja'));
 assert.deepEqual(defaultSpecialtyRoleLinks('brandweer',pair,false).filter(x=>x.roleId===BW_LOG_SIG_ROLE_ID),pair);
});

test('a shared role may hold both DIFFERENT badges without overwriting the other',()=>{
 const [log,sign]=pair;
 const links=[
  {...log,assetKey:'specialty_brandweer_logistiek'},
  {...sign,assetKey:'specialty_brandweer_signalisatie'}
 ];
 assert.deepEqual(validateSpecialtyRoleLinks(input(links),'brandweer',labelList,roleList).links,links);
 const changed=defaultSpecialtyRoleLinks('brandweer',[links[0]],false).filter(x=>x.roleId===BW_LOG_SIG_ROLE_ID);
 assert.equal(changed[0].assetKey,'specialty_brandweer_logistiek');
 assert.equal(changed[1].label,'Signalisatie');
 assert.equal(changed[1].assetKey,'');
 const images=BW_LOG_SIG_SPECIALTIES.map(fireSharedSpecialtyAssetKeys);
 assert.ok(images[0].includes('specialty_brandweer_logistiek'));
 assert.ok(images[1].includes('specialty_brandweer_signalisatie'));
 assert.ok(!images[0].some(x=>images[1].includes(x)));
});

test('duplicate same-label shared mapping, unrelated shared specialties, and reused other roles are rejected',()=>{
 const [log,sign]=pair;
 assert.throws(()=>validateSpecialtyRoleLinks(input([log,log]),'brandweer',labelList,roleList),/al aan BW log\/signa gekoppeld/);
 assert.throws(()=>validateSpecialtyRoleLinks(input([{...log,label:'Ladderwagen'}]),'brandweer',labelList,roleList),/alleen Logistiek en Signalisatie/);
 const ladder={...log,roleId:'1399000349037166664',label:'Ladderwagen'};
 assert.throws(()=>validateSpecialtyRoleLinks(input([ladder,{...ladder,label:'Signalisatie'}]),'brandweer',labelList,roleList),/één specialisatiekoppeling/);
 assert.ok(SPECIALTY_STATES.includes('Ja'));
});

test('only verified matching Discord role can activate the paired specializations on organogram',()=>{
 const server=read('src/organogram-placement-routes.js');
 const html=read('public/organogram-hierarchie.html');
 const library=read('public/beeldbibliotheek.html');
 assert.match(server,/verified\.has\(x\.roleId\)/);
 assert.match(server,/const curatedFire=x=>p\.dept==='brandweer'/);
 assert.match(server,/knownFireRoleSpecialty\(x\.roleId,x\.label\)/);
 assert.match(server,/fireSpecialtyAssetKeys\(x\.label\)/);
 assert.match(server,/assetUrls\.get\(assetFor\(x\)\)\|\|''/);
 assert.match(server,/for\(const link of specialtyPatches\)/);
 assert.match(html,/matchedArtwork\?\.imageUrl\|\|fireSpecialtyPatchUrl\(name\)/);
 assert.match(library,/x\.roleId!==roleId\|\|\(!roleId\|\|sharedFire\)&&x\.label!==specialtyLabel/);
 assert.match(library,/if\(roleId&&!sharedFire\)\{/);
});

test('generic patch links without role can coexist for several fire specialties',()=>{
 const manualLinks=[
  {roleId:'',label:'Ladderwagen',level:'Handmatig',value:'Ja',assetKey:'patch_brandweer_ladderwagen'},
  {roleId:'',label:'RED team',level:'Handmatig',value:'Ja',assetKey:'specialty_brandweer_red_team'}
 ];
 const saved=validateSpecialtyRoleLinks(input(manualLinks),'brandweer',labelList,roleList);
 assert.deepEqual(saved.links,manualLinks);
 const withRole=validateSpecialtyRoleLinks(input([...manualLinks,pair[0]]),
  'brandweer',['Logistiek',...labelList],roleList);
 assert.equal(withRole.links.length,3);
 const organogram=read('src/organogram-placement-routes.js');
 assert.match(organogram,/x\.roleId===''\|\|idOK\(x\.roleId\)/);
 assert.match(organogram,/const manual=all\.filter\(x=>!x\.roleId&&valid\(x\)/);
});
