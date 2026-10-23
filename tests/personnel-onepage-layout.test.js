import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const layout=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');

test('TEST: horizontaal dossierblad bevat precies negen direct zichtbare rubrieken',()=>{
  assert.match(page,/document\.body\.classList\.add\('dossier-onepage'\)/);
  assert.match(page,/personnel-onepage-test\.css/);
  assert.match(layout,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(layout,/#dossierTabBar\{display:none!important\}/);
  assert.match(page,/class="landscape-grid"/);
  for(const category of ['gegevens','specialisaties','movements','leave','observations',
    'training','basisNotes','notes','sanctions'])
    assert.match(page,new RegExp('data-sheet-tile="'+category+'"'),category);
  assert.match(page,/pane\.hidden=pane\.dataset\.dossierPane!=='overzicht'/);
  assert.match(layout,/\.dossier-pane\[hidden\]\{display:none!important\}/);
  const src=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src);
  assert.doesNotThrow(()=>new Script(src.replace(/^import [^\n]*\n/gm,'')));
});
test('TEST: registraties en verlof blijven gekoppeld aan dezelfde beschermde bronnen',()=>{
  assert.match(page,/\/api\/leave\/person\//);
  assert.match(page,/leaveStatusText\(item\.status\)/);
  assert.match(page,/staffManualLeaveForm/);
  assert.match(page,/sheetSetRows\('basisNotes'/);
  assert.match(page,/sheetSetRows\('observations'/);
  assert.match(page,/sheetSetRows\('sanctions'/);
  assert.match(page,/sheetSetRows\('training'/);
  assert.match(page,/sheetSetRows\('movements'/);
  assert.match(page,/sheetSetRows\('notes'/);
  assert.match(page,/formalPermissions\?\.writesEnabled/);
  assert.match(page,/observationDepartments\?\.includes\(selected\.dept\)/);
  assert.match(page,/sanctionDepartments\?\.includes\(selected\.dept\)/);
  assert.match(page,/function startFormalRegistration\(type\)/);
  assert.match(page,/Toon alle /);
});
