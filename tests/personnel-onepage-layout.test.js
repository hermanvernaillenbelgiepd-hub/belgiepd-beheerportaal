import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const layout=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');

test('TEST personeelsfiche toont iedere disciplinecategorie op één pagina',()=>{
  assert.match(page,/document\.body\.classList\.add\('dossier-onepage'\)/);
  assert.match(page,/personnel-onepage-test\.css/);
  assert.match(page,/pane\.hidden=pane\.dataset\.dossierPane==='overzicht'/);
  assert.match(layout,/grid-template-areas:/);
  for(const category of ['gegevens','specialisaties','nieuw','verlof','sancties',
    'opleidingen','registraties','middenregistraties','historiek'])
    assert.ok(layout.includes('grid-area:'+category),category);
  assert.match(layout,/max-height:none!important;overflow:visible!important/);
  const inline=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  assert.doesNotThrow(()=>new Script(inline.replace(/^import [^\n]*\n/gm,'')));
});
test('TEST houdt centrale verlofdata en dienstgebonden schrijfcontrole',()=>{
  assert.match(page,/\/api\/leave\/person\//);
  assert.match(page,/leaveStatusText\(item\.status\)/);
  assert.match(page,/staffManualLeaveForm/);
  assert.match(page,/formalPermissions\?\.writesEnabled/);
  assert.match(page,/observationDepartments\?\.includes\(selected\.dept\)/);
  assert.match(page,/sanctionDepartments\?\.includes\(selected\.dept\)/);
  assert.match(page,/Dossieroverzicht|In één oogopslag/);
});
