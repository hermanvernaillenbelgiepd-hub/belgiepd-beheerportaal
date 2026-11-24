import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('alle rubrieken blijven in politie-dossier aanwezig',()=>{
 const h=read('public/personeelsbeheer.html');
 assert.match(h,/installDossierTileCollapse\(sheet\)/);
 for(const name of ['sheetMovements','sheetLeave','sheetObservations','sheetTraining','sheetNotes','sheetBasisNotes','sheetActivityPings','sheetSanctions'])
  assert.match(h,new RegExp('id="'+name+'"'));
});
test('Brandweer krijgt onafhankelijke inklapbare rubrieken',()=>{
 const h=read('public/brandweerdossier.html');
 assert.match(h,/installDossierTileCollapse\(\$\('overviewSection'\)\)/);
 assert.match(h,/data-sheet-tile="movements"/);
});
test('presentatiemodule laat dossierlogica intact',()=>{
 assert.match(read('public/dossier-tile-collapse.js'),/dataset\.sheetTile==='movements'/);
 assert.match(read('public/dossier-tile-collapse.css'),/data-collapsed="true"/);
});
