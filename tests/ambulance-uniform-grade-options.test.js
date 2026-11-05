import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {AMBULANCE_FUNCTIONS,ambulanceFunction,ambulanceUniformFallback} from '../public/uniform-profile-policy.js';
import {validateComposition} from '../src/uniform-composition-routes.js';
const page=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
const code=AMBULANCE_FUNCTIONS.map(([key])=>key);
const draft=selector=>({department:'ambulance',scope:'function',selector,
  assets:{uniform:'azls_jas'},layers:{},reason:'AZLS ranguniform apart'});
test('AZLS atelier distinguishes Stagiair H-ARTS H-VPK H-AMB and existing ranks',()=>{
 assert.deepEqual(code,['stag','ambulancier','hamb','vpk','hvpk','arts','harts','dirmed']);
 assert.deepEqual(AMBULANCE_FUNCTIONS.filter(([x])=>['stag','harts','hvpk','hamb'].includes(x))
  .map(([,label])=>label),['Stagiair','H-AMB','H-VPK','H-ARTS']);
 for(const key of code)assert.equal(validateComposition(draft(key)).selector,key);
 for(const key of ['invalid','motor','bio'])assert.throws(()=>validateComposition(draft(key)));
 assert.match(page,/if\(dept\.value==='ambulance'\)return AMBULANCE_FUNCTIONS\.map/);
});
test('existing AMB VPK ARTS and specialised H calls resolve independently',()=>{
 const byCall={
 'STAG-01':'stag','STAGE-01':'stag','STAGIAIR-01':'stag',
 'HAMB-01':'hamb','AMB-01':'ambulancier','HVPK-01':'hvpk','VPK-01':'vpk',
 'HARTS-01':'harts','H-ARTS-01':'harts','H-VPK-02':'hvpk',
 'H-AMB-02':'hamb','ARTS-01':'arts','DIRMED-01':'dirmed'};
 for(const [call,expected] of Object.entries(byCall)){
  assert.equal(ambulanceFunction({dept:'ambulance',call}),expected,call);
 }
 for(const [rank,expected] of [['Stagiair','stag'],['Hoofd-Arts','harts'],
  ['Hoofd-Verpleegkundige','hvpk'],['Hoofd-Ambulancier','hamb']]){
  assert.equal(ambulanceFunction({dept:'ambulance',rank}),expected,rank);
 }
 assert.equal(ambulanceFunction({dept:'politie',call:'HARTS-01'}),'');
});
test('higher function uniforms retain old base coats until distinct grade saved',()=>{
 assert.equal(ambulanceUniformFallback('harts'),'arts');
 assert.equal(ambulanceUniformFallback('hvpk'),'vpk');
 assert.equal(ambulanceUniformFallback('hamb'),'ambulancier');
 assert.equal(ambulanceUniformFallback('stag'),'');
 const script=source.replace(/^import\s+[^;]+;$/gm,'');
 const ctx={window:{},ambulanceUniformFallback,ambulanceFunction,
  getTier:()=>'',policeUniformGroup:()=>'',depannageFunction:()=>'',citizenUniformRank:()=>'',policeCallSeries:()=>''};
 runInNewContext(script,ctx);
 const api=ctx.window.BPDUniformAssignments;
 const old='/api/role-artwork/file/uniform_ambulance_base_art?v=1';
 const fresh='/api/role-artwork/file/uniform_ambulance_harts_own?v=1';
 api.setData([],[{key:'uniform_ambulance_base_art',imageUrl:old},
  {key:'uniform_ambulance_harts_own',imageUrl:fresh}],
  [],[],[{department:'ambulance',scope:'function',selector:'arts',
   assets:{uniform:'base_art'},layers:{}}]);
 assert.equal(api.forPerson({dept:'ambulance',rank:'Hoofd-Arts',call:'HARTS-01'}).uniformUrl,old);
 api.setData([],[{key:'uniform_ambulance_base_art',imageUrl:old},
  {key:'uniform_ambulance_harts_own',imageUrl:fresh}],
  [],[],[{department:'ambulance',scope:'function',selector:'arts',
   assets:{uniform:'base_art'},layers:{}},
   {department:'ambulance',scope:'function',selector:'harts',
    assets:{uniform:'harts_own'},layers:{}}]);
 assert.equal(api.forPerson({dept:'ambulance',rank:'Hoofd-Arts',call:'HARTS-01'}).uniformUrl,fresh);
 assert.equal(api.forPerson({dept:'ambulance',rank:'Arts',call:'ARTS-01'}).uniformUrl,old);
});
