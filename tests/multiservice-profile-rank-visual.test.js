import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/organogram-profile-compact.css',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
test('AZLS, Depannage and Burger use compact responsive profiles',()=>{
 for(const cls of ['azls-person-profile','depannage-person-profile','burger-person-profile']){
  assert.ok(html.includes("dialog.classList.toggle('"+cls+"'"));
  assert.ok(css.includes('.'+cls));
 }
 assert.match(css,/grid-template-areas:"details specials"!important/);
 assert.match(css,/max-width:170px!important/);
 assert.match(css,/max-width:1080px/);
 assert.match(css,/max-width:650px/);
 assert.match(html,/p\.dept!=='ambulance'&&matchedArtwork\?\.source==='discord'/);
 assert.match(route,/status:String\(p\.status\|\|''\)\.trim\(\)\.slice\(0,30\),/);
});
test('Brandweer explicit rank badge outranks fallback but not personal grade',()=>{
 const script=source.replace(/^import\s+[^;]+;$/gm,'');
 const ctx={window:{},getTier:()=>'',policeUniformGroup:()=>'',ambulanceFunction:()=>'',depannageFunction:()=>'',policeCallSeries:()=>''};
 runInNewContext(script,ctx);
 const art=(kind,code)=>({key:kind+'_brandweer_'+code,imageUrl:'/api/role-artwork/file/'+kind+'_brandweer_'+code+'?v=one'});
 const api=ctx.window.BPDUniformAssignments;
 api.setData([],[art('rank','zonecommandant'),art('specialty','zonechef')],[
  {department:'brandweer',kind:'specialty',scope:'rank',selector:'zonechef',assetCode:'zonechef'}
 ]);
 const p={dept:'brandweer',call:'ZONE-01',rank:'Zonecommandant'};
 assert.equal(api.forPerson(p).rankUrl,art('specialty','zonechef').imageUrl);
 api.setData([],[art('rank','zonecommandant'),art('specialty','zonechef'),art('rank','personal')],[
  {department:'brandweer',kind:'specialty',scope:'rank',selector:'zonechef',assetCode:'zonechef'},
  {department:'brandweer',kind:'rank',scope:'person',selector:'call_zone_01',assetCode:'personal'}
 ]);
 assert.equal(api.forPerson(p).rankUrl,art('rank','personal').imageUrl);
});
