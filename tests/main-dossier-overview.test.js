import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
test('MAIN: persoonsfiche heeft een compacte samenvatting met duidelijke categorieën',()=>{
  for(const id of ['metricObservations','metricSanctions','metricNotes','metricTraining',
    'sheetFormal','sheetNotes','sheetTraining','sheetMovements','sheetLeave',
    'staffFormalForm','formalWriteStatus']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html, /Dossieroverzicht/);
  assert.match(html,/Recente registraties/);
  assert.match(html,/dashboard-actions/);
  assert.match(html,/data-formal-action="observatie"/);
  assert.match(html,/data-formal-action="sanctie"/);
  assert.match(html,/data-open-sheet="historiek"/);
  assert.doesNotMatch(html,/dossier-compact-test\.css/);
  assert.doesNotMatch(html,/burger-fiche\.html/);
});
test('MAIN: UI blijft op bestaande afgeschermde schrijfroutes aangesloten',()=>{
  assert.match(html,/formalPermissions\?\.writesEnabled/);
  assert.match(html,/observationDepartments\?\.includes\(selected\.dept\)/);
  assert.match(html,/sanctionDepartments\?\.includes\(selected\.dept\)/);
  assert.match(html,/\/api\/registrations\/entries/);
  assert.match(html,/function startFormalRegistration\(type\)/);
  assert.match(html,/if\(!allowed\|\|!formalPermissions\.actor\)return/);
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match);
  assert.doesNotThrow(()=>new Script(match[1].replace(/^import [^\n]*\n/gm,'')));
});
