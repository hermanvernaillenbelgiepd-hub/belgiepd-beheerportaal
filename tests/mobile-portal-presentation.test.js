import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('narrow personnel tables turn into labelled cards without omitting columns',()=>{
  const js=source('public/bpd-navigation.js');
  const css=source('public/bpd-navigation.css');
  assert.ok(js.includes("const selector='table.mr-table,table.staff-roster-table'"));
  assert.ok(js.includes('cell.dataset.bpdLabel=label'));
  assert.ok(js.includes("table.classList.toggle('bpd-adaptive-cards'"));
  assert.ok(css.includes('/* BelgiumPD touch-first personnel layouts — 2026-11-15 */'));
  assert.ok(css.includes('.mr-table.bpd-adaptive-cards > tbody > tr.mr-person'));
  assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'));
  assert.ok(css.includes('.mr-table.bpd-adaptive-cards .mr-specialty'));
  assert.ok(css.includes('.mr-table.bpd-adaptive-cards .mr-person-open'));
  assert.ok(css.includes('.staff-roster-table.roster-police-compact.bpd-adaptive-cards'));
  const mobile=css.split('/* BelgiumPD touch-first personnel layouts — 2026-11-15 */')[1];
  assert.ok(!mobile.includes('display:none'),'Mobile overrides must not hide specialization cells');
});

test('mobile dossiers remain readable and touch-operable',()=>{
  const css=source('public/bpd-dossier-shared.css');
  assert.ok(css.includes('/* BelgiumPD touch-friendly dossier controls — 2026-11-15 */'));
  assert.ok(css.includes('body.bpd-unified-dossier :is(button,[role="button"],input[type="submit"])'));
  assert.ok(css.includes('min-height:44px;touch-action:manipulation'));
  assert.ok(css.includes('font-size:16px;max-width:100%;box-sizing:border-box'));
  assert.ok(css.includes('@media(max-width:420px)'));
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr)!important'));
});
