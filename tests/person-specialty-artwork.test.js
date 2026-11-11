import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePersonSpecialtyPatch,overlayPersonalSpecialtyArtwork,personPatchKey,
 PERSON_SPECIALTY_PATCH_COLLECTION} from '../src/person-specialty-artwork-policy.js';
const src=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const pid='1309532438019706001';
const base={department:'politie',personId:pid,specialty:'AE',
 sourceArtworkKey:'specialty_politie_aeleidingnieuw',reason:'Leiding gebruikt een andere patch'};
test('persoon exact op Discord-ID, dienst en bestaande specialisatie; nooit een ranggrant',()=>{
 const valid=validatePersonSpecialtyPatch(base);
 assert.equal(valid.key,personPatchKey('politie',pid,'AE'));
 assert.equal(PERSON_SPECIALTY_PATCH_COLLECTION,'bpd_person_specialty_artwork');
 for(const wrong of [
  {...base,personId:'ae'}, {...base,department:'burger'},
  {...base,sourceArtworkKey:'specialty_brandweer_aeleidingnieuw'},
  {...base,sourceArtworkKey:'../secret'}, {...base,specialty:'Korpsleiding'},
  {...base,reason:'te kort'}, {...base,roleId:'1309532438019706002'}
 ])assert.throws(()=>validatePersonSpecialtyPatch(wrong));
 assert.equal(validatePersonSpecialtyPatch({
  department:'politie',personId:pid,specialty:'AE',
  reason:'Verwijder persoonlijke patchkoppeling'
 },[],true).personId,pid);
});
test('persoonlijke badge wint van rolbadge maar laat niveau, rol en brongegevens intact',()=>{
 const p={dept:'politie',personId:pid},
  assigned=[{label:'AE',level:'Teamleader',roleId:'1337775768083632158',
    imageUrl:'/old',source:'discord'}],roles={specialties:['AE']},
  links=[{...base,active:true}],assets=new Map([[base.sourceArtworkKey,'/personal']]),
  norm=(_dept,label)=>String(label);
 const updated=overlayPersonalSpecialtyArtwork(assigned,p,roles,links,assets,norm);
 assert.equal(updated[0].imageUrl,'/personal');
 assert.equal(updated[0].source,'person');
 assert.equal(updated[0].level,'Teamleader');
 assert.equal(updated[0].roleId,'1337775768083632158');
 assert.equal(assigned[0].imageUrl,'/old');
 assert.deepEqual(overlayPersonalSpecialtyArtwork(assigned,p,{specialties:[]},links,assets,norm),assigned);
 assert.deepEqual(overlayPersonalSpecialtyArtwork(assigned,{...p,personId:'1309532438019706002'},roles,links,assets,norm),assigned);
 assert.deepEqual(overlayPersonalSpecialtyArtwork(assigned,p,roles,[{...base,active:false}],assets,norm),assigned);
});
test('zonder bestaande specialisatie wordt geen persoonlijke badge toegekend',()=>{
 const p={dept:'politie',personId:pid},norm=(_d,label)=>label,
 links=[{...base,active:true}],assets=new Map([[base.sourceArtworkKey,'/personal']]);
 assert.deepEqual(overlayPersonalSpecialtyArtwork([],p,{specialties:['AE']},links,assets,norm),
 [{label:'AE',level:'',roleId:'',imageUrl:'/personal',source:'person'}]);
 assert.deepEqual(overlayPersonalSpecialtyArtwork([],p,{specialties:[]},links,assets,norm),[]);
});
test('API, UI en profiel behouden visueel-only gedrag en audit',()=>{
 const route=src('src/role-artwork-routes.js'),org=src('src/organogram-placement-routes.js'),
 client=src('public/organogram-hierarchie.html'),ui=src('public/beeldbibliotheek.html'),
 server=src('src/server.js');
 assert.match(route,/person_specialty_patch_linked/);
 assert.match(route,/person_specialty_patch_unlinked/);
 assert.match(route,/qualificationChanged:false/);
 assert.match(route,/snapshot\.data\.filter\(p=>p\.dept===input\.department&&p\.personId===input\.personId\)/);
 assert.match(org,/overlayPersonalSpecialtyArtwork\(/);
 assert.match(org,/PERSON_SPECIALTY_PATCH_COLLECTION/);
 assert.match(client,/x\.source==='registered'\|\|x\.source==='person'/);
 assert.match(client,/entry\.source==='person'\|\|!aeSpecific/);
 assert.match(ui,/id="linkPersonId"/);
 assert.match(ui,/person-specialty-link/);
 assert.match(server,/installRoleArtworkRoutes\(app,\{requireUser,getSnapshot\}\)/);
});

test('persoonlijke AE-patch wint ook na afzonderlijke live Discord-profielcontrole',()=>{
 const server=src('src/organogram-placement-routes.js'),
  client=src('public/organogram-hierarchie.html');
 const refresh=server.slice(
  server.indexOf("app.get('/api/organogram/specialty-check/"),
  server.indexOf('// Targeted, audited AE presentation correction'));
 assert.ok(refresh.length>1000);
 assert.match(refresh,/personPatchKey\('politie',staff\.personId,label\)/);
 assert.match(refresh,/doc\.data\(\)\)\.filter\(link/);
 assert.match(refresh,/link\.personId===staff\.personId/);
 assert.match(refresh,/eligible\.includes\(link\.specialty\)/);
 assert.match(refresh,/image\.get\('active'\)!==true/);
 assert.match(refresh,/const profilePatches=overlayPersonalSpecialtyArtwork\(/);
 assert.match(refresh,/patches:profilePatches/);
 assert.match(client,/const refreshedPersonal=new Set\(livePatches\.filter\(x=>x\.source==='person'\)/);
 assert.match(client,/registered\.filter\(x=>x\.source!=='person'\|\|!refreshedPersonal\.has\(x\.label\)\)/);
});
test('ongeldige patch toont tekstfallback zonder rang- of Discordwijziging',()=>{
 const client=src('public/organogram-hierarchie.html');
 const ui=src('public/beeldbibliotheek.html');
 assert.match(client,/badge\.addEventListener\('error',\(\)=>\{/);
 assert.match(client,/patch niet beschikbaar/);
 assert.match(ui,/const priorAsset=\$\('linkAsset'\)\.value,priorSpecialty=\$\('linkSpecialty'\)\.value/);
 assert.match(ui,/specialtyConfig\?\.labels\?\.includes\(priorSpecialty\)/);
});
