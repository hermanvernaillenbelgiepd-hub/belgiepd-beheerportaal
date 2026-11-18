import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHonorableInpActivation,honorablePreviousTraining,
 overlayPersonnelLifecycle} from '../src/personnel-lifecycle-policy.js';
const id='111111111111111111';
const historical={dept:'politie',personId:id,name:'Fictieve medewerker',
 rank:'Commissaris',call:'930',status:'Actief',
 specialties:[{label:'K9',value:'Ja'},{label:'RAGO-IO',value:'In opleiding'},
  {label:'MOTARD',value:'Volwaardig'}]};
const ledger={dept:'politie',discordId:id,state:'active',revision:4,
 honorableResignation:true,restoreFromArchive:true,snapshot:historical,
 honorableInpAssignment:{rank:'Inspecteur',call:'456',series:'2',confirmed:true}};
test('INP-plaatsing vereist vrij nummer, reeks, revisie, eigen motivering en expliciete bevestiging',()=>{
 assert.deepEqual(validateHonorableInpActivation({newCall:'S-456',series:'2',
  expectedRevision:3,reason:'Onafhankelijke beslissing na controle van alle rollen',
  confirm:'INP'}),{newCall:'456',series:'2',expectedRevision:3,
  reason:'Onafhankelijke beslissing na controle van alle rollen'});
 for(const invalid of [
  {newCall:'930',series:'1'},
  {newCall:'612',series:'1'},
  {newCall:'456',series:'4'},
  {newCall:'456',series:'1',confirm:'JA'},
  {newCall:'456',series:'1',expectedRevision:-1},
  {newCall:'456',series:'1',unexpected:true}
 ]){
  assert.throws(()=>validateHonorableInpActivation({
   expectedRevision:3,reason:'Onafhankelijke beslissing na volledige Discordcontrole',
   confirm:'INP',...invalid}));
 }
});
test('oude kwalificaties blijven uitsluitend historiek, IO geeft geen volwaardig opleidingsbewijs',()=>{
 assert.deepEqual(honorablePreviousTraining(historical),['K9','MOTARD']);
 const originals=[historical];
 const active=overlayPersonnelLifecycle(originals,[ledger]);
 assert.equal(active.length,1);
 assert.equal(active[0].rank,'Inspecteur');
 assert.equal(active[0].call,'456');
 assert.equal(active[0].series,'Reeks 2');
 assert.deepEqual(active[0].specialties,[]);
 assert.deepEqual(active[0].previousSpecializationTraining,['K9','MOTARD']);
 assert.equal(historical.rank,'Commissaris');
 assert.equal(historical.call,'930');
 const resurrected=overlayPersonnelLifecycle([],[ledger]);
 assert.equal(resurrected.length,1);
 assert.equal(resurrected[0].rank,'Inspecteur');
 assert.deepEqual(resurrected[0].specialties,[]);
});
test('onvolledige of verdachte herinstroom toont NOOIT de oude hoge rang',()=>{
 const withoutAssignment={...ledger,honorableInpAssignment:null};
 assert.equal(overlayPersonnelLifecycle([historical],[withoutAssignment]).length,0);
 assert.equal(overlayPersonnelLifecycle([],[withoutAssignment]).length,0);
 const pending={...ledger,state:'pending'};
 assert.equal(overlayPersonnelLifecycle([historical],[pending]).length,0);
 const archived={...ledger,state:'archived'};
 assert.equal(overlayPersonnelLifecycle([historical],[archived]).length,0);
});
test('herinstroomcontrole raakt alleen eigen politiedienst en vraagt levende Discord-botrollen',()=>{
 const route=readFileSync(new URL('../src/personnel-lifecycle-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(route,/verifyGuildAuthorizationRoles\(discordId,\{cacheResults:false\}\)/);
 assert.match(route,/ids\.has\(POLICE\)\|\|!ids\.has\(BASIC\)/);
 assert.match(route,/ROLE_CATALOG\.filter/);
 assert.match(route,/if\(!allowed\(req\.bpd,person\)\)/);
 assert.match(route,/user\.get\('status'\)==='blocked'/);
 assert.match(route,/tx\.set\(accountRef,/);
 assert.match(route,/role:'basiskader'/);
 assert.match(route,/invalidateUserAccess\(discordId\)/);
 assert.match(server,/invalidateUserAccess:id=>authDocCache\.delete\(USER_COLLECTION/);
 assert.match(route,/canActivateInp:/);
 assert.match(ui,/Herinstroom als INP afronden/);
 assert.match(ui,/activate-inp/);
 assert.match(route,/if\(action==='activate'&&prev\.honorableResignation===true\)/);
});
