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
 assert.match(compact,/grid-template-columns:minmax\(0,1\.08fr\) minmax\(0,1fr\)/);
 assert.match(compact,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(compact,/--police-specialty-card-height:60px/);
 assert.match(compact,/height:min\(35dvh,310px\)!important/);
 assert.match(modal,/#personnelCardDialog\{/);
 assert.match(modal,/#personnelCardFrame\{/);
});

test('compact badges retain aspect ratio and limited viewport remains scrollable',()=>{
 assert.match(compact,/--bpd-specialty-badge-height:calc\(var\(--bpd-specialty-badge-width\) \* 5 \/ 16\)/);
 assert.match(compact,/\.person-profile-specialty-rago-io\{/);
 assert.match(compact,/\.person-profile-specialty-k9 \.k9-role-patch/);
 assert.match(compact,/overflow-y:auto/);
 assert.match(compact,/@media \(min-width:1000px\) and \(max-height:740px\)/);
 assert.match(html,/html\.roster-card-embed \.person-profile-shell\{[\s\S]*?overflow-y:auto/);
});
