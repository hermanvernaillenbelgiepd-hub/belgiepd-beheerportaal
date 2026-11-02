import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicDecorations} from '../src/personnel-decoration-policy.js';

const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
const classic=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');

test('one operational organogram is used, without a board panel',()=>{
 assert.match(page,/Operationeel organogram per hulpdienst/);
 assert.doesNotMatch(page,/id="board-panel"/);
 assert.doesNotMatch(page,/id="board-members"/);
 assert.doesNotMatch(page,/Klassiek organogram/);
 assert.match(classic,/location\.replace\('\/organogram-hierarchie\.html'/);
 assert.match(page,/person-profile-layout/);
});
test('staff dialog prioritizes 2:1 coat and shows five operational facts',()=>{
 assert.match(page,/operational-profile \.person-profile-layout\{\s*display:grid;grid-template-columns:minmax\(0,2fr\) minmax\(290px,1fr\)/);
 for(const label of ['CALL','Dienst','Rang / functie','Niveau (indicatief)','Personeelsstatus'])
  assert.ok(page.includes("fact('"+label+"'"),'Missing: '+label);
 assert.doesNotMatch(page,/fact\('Opleidingsfunctie'/);
 assert.match(page,/person-profile-call strong/);
 assert.match(page,/person-profile-awards-panel/);
 assert.match(page,/person-profile-specialization-box/);
});
test('medal manager only uses existing authenticated subject checked API',()=>{
 assert.match(page,/BPDDecorations\?\.renderAwards/);
 assert.match(page,/BPDDecorations\?\.manager/);
 assert.match(page,/BPDDecorations\?\.uploadTools/);
 assert.match(page,/p\.dept==='politie'&&auth\?\.currentUser/);
 assert.match(source,/PERSONNEL_DECORATIONS_COLLECTION/);
 assert.match(source,/publicDecorations\(/);
 assert.match(source,/awards:p\.dept==='politie'/);
});
test('only active public awards appear on operational profile',()=>{
 const now='2026-10-30';
 const item={catalogId:'dienstmedaille_goud',startDate:'2026-01-01',
  endDate:null,public:true,reason:'Operationele dienst'};
 assert.equal(publicDecorations([item],now).length,1);
 assert.deepEqual(publicDecorations([{...item,public:false}],now),[]);
 assert.deepEqual(publicDecorations([{...item,revokedAt:'2026-10-01'}],now),[]);
});


test('MAIN organogram starts empty and never falls back to fictitious staff on an error',()=>{
 assert.match(page,/<button[^>]*id="demo-toggle"[^>]*hidden>/);
 assert.match(page,/const state=\{view:'alle',query:'',demo:false,live:\[\],board:\[\],loaded:false/);
 assert.match(page,/fixtureModeAllowed=config\.firebaseConfig\?\.projectId==='belgiepd-test'/);
 assert.match(page,/else if\(btn\.id==='demo-toggle'&&fixtureModeAllowed\)/);
 assert.match(page,/if\(!state\.loaded&&!state\.demo\)\{syncCadreToggle\(\);return;\}/);
 assert.match(page,/state\.loaded=false;state\.live=\[\];state\.board=\[\];state\.demo=false/);
 assert.match(page,/Organogramgegevens tijdelijk niet beschikbaar:/);
 assert.match(page,/Organogram niet beschikbaar:/);
 assert.doesNotMatch(page,/state\.demo=true/);
 assert.doesNotMatch(page,/De fictieve demonstratie blijft herkenbaar/);
});
