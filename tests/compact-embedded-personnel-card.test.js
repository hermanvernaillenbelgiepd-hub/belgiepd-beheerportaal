import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const modal=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const compact=html.split('/* Compact desktop personnel card in the single Personeelsbeheer dialog.')[1]
 ?.split('/* Brandweer organogram thumbnails')[0]||'';

test('embedded desktop profile uses full dialog width and compact two-column specialties',()=>{
 assert.ok(compact,'Compact profile styles are present');
 assert.match(compact,/@media \(min-width:1000px\)/);
 assert.match(compact,/grid-template-columns:minmax\(0,0\.85fr\) minmax\(0,1\.15fr\)/);
 assert.match(compact,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(compact,/--police-specialty-card-height:78px/);
 assert.match(compact,/height:min\(52dvh,490px\)!important/);
 assert.match(modal,/#personnelCardDialog\{/);
 assert.match(modal,/#personnelCardFrame\{/);
});

test('compact badges retain aspect ratio and limited viewport remains scrollable',()=>{
 assert.match(compact,/--bpd-specialty-badge-height:calc\(var\(--bpd-specialty-badge-width\) \* 5 \/ 16\)/);
 assert.match(compact,/\.person-profile-specialty-rago-io\{/);
 assert.match(compact,/\.person-profile-specialty-k9 \.k9-role-patch/);
 assert.match(compact,/overflow-y:auto/);
 assert.match(compact,/width:min\(100%,410px,44dvh\)!important/);
 assert.match(html,/html\.roster-card-embed \.person-profile-shell\{[\s\S]*?overflow-y:auto/);
});

test('responsive uniform area reserves room for the complete portrait coat',()=>{
 // The portrait stage of an uploaded uniform is around 1.12 times as tall as
 // the portrait width. Ensure our responsive sizing leaves enough room.
 for(const vh of [650,700,740,768,900,1080,1440]){
  const width=Math.min(410,.44*vh);
  const height=Math.min(.52*vh,490);
  assert.ok(height>=width*1.12,
   'Uniform cropped at viewport height '+vh+': '+width+'x'+height);
 }
 assert.doesNotMatch(compact,/height:min\(31dvh,250px\)!important/);
 assert.match(compact,/--bpd-specialty-badge-width:clamp\(128px,12\.7vw,170px\)/);
 assert.match(compact,/font-size:12px/);
});
