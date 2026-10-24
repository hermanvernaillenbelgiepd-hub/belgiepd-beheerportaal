import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const police=html('personeelsbeheer.html');
const fire=html('brandweerdossier.html');
const style=html('bpd-dossier-shared.css');

test('All four services share one true one-page dossier stylesheet',()=>{
  for(const source of [police,fire]){
    assert.match(source,/bpd-dossier-shared\.css/);
    assert.match(source,/personnel-onepage-test\.css/);
    assert.match(source,/dossier-onepage/);
    assert.match(source,/sheet-identity/);
    assert.match(source,/dossier-main-row/);
    assert.match(source,/dossier-right-column/);
    assert.match(source,/dossier-lower-row/);
    for(const tile of ['leave','notes','specialisaties','movements',
      'training','basisNotes','observations','sanctions']){
      assert.ok(source.includes('data-sheet-tile="'+tile+'"'),tile);
    }
  }
  assert.match(style,/Uniform six-column identity/);
  assert.match(style,/repeat\(6,minmax\(0,1fr\)\)/);
});
test('Only Brandweer dossier reads the role-filtered Fire API',()=>{
  assert.match(fire,/\/api\/fire-dossiers\//);
  assert.doesNotMatch(fire,/\/api\/registrations\/entries\//);
  assert.match(fire,/allowedTabs\.has\(button\.dataset\.openTab\)/);
  assert.match(fire,/pane\.dataset\.pane!=='overzicht'/);
  assert.match(police,/dossierNativeDepartments|canOpenDossier/);
});
