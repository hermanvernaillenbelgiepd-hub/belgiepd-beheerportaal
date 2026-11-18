import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicDecorations,DECORATION_CATALOG}
 from '../src/personnel-decoration-policy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('public/assets/organogram-decorations.css');
const ui=read('public/assets/organogram-decorations.js');

test('eretekens op witte personeelskaart hebben eigen contrastrijke kleur',()=>{
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) \.bpd-awards h3/);
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) \.bpd-awards \.bpd-award-label/);
 assert.match(css,/color:#203b5f!important/);
 assert.match(css,/color:#4d6583!important/);
 assert.match(css,/color:#684a0b!important/);
});
test('korpspluim is een enkel uniformembleem, de herhaalde mentions staan als teller op de personeelskaart',()=>{
 const today='2026-11-18';
 const award=(id,startDate=today,endDate=null)=>({id,catalogId:'korpspluim',
   public:true,startDate,endDate});
 const a=publicDecorations([
  award('a'),award('b'),award('c','2026-10-01','2026-11-17'),
  {...award('d'),revokedAt:'2026-11-12T16:00:00Z'},
  {...award('e'),public:false}
 ],today);
 assert.equal(DECORATION_CATALOG.find(x=>x.id==='korpspluim').kind,'badge');
 assert.equal(a.length,1);
 assert.equal(a[0].count,2);
 assert.match(ui,/row\.append\(node\('span','bpd-award-count','×'\+x\.count\)\)/);
 assert.match(css,/\.bpd-uniform-ribbons>\.bpd-ribbon\[data-award="korpspluim"\]::before/);
 assert.match(css,/display:flex/);
 assert.match(ui,/valid\.filter\(x=>x\.kind==='ribbon'\|\|x\.kind==='badge'\)/);
});
