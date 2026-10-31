import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {policeRosterStatusStyle} from '../public/member-police-roster.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('member-police-roster.css');
const js=read('member-police-roster.js');
const page=read('personeelslijst.html');
const dashboard=read('index.html');

test('official personnel statuses map to precisely the six requested colors',()=>{
 const expectations=[
  ['ACTIEF','actief'],['Actief','actief'],['VERLOF','verlof'],
  ['INACTIEF','inactief'],['50/50','fifty-fifty'],
  ['50 / 50','fifty-fifty'],['NON-ACTIEF','non-actief'],
  ['non actief','non-actief'],['Nonactief','non-actief'],
  ['VERWIJDERD','verwijderd']
 ];
 for(const [source,expected] of expectations)
  assert.equal(policeRosterStatusStyle(source),expected,source);
 for(const unknown of ['Onbekend','Geschorst','In opleiding','',null])
  assert.equal(policeRosterStatusStyle(unknown),'onbekend');
});

test('every status box has precisely the same fixed width and height',()=>{
 const basic=css.match(/\.mr-table \.mr-status\{([^}]+)\}/)?.[1]||'';
 assert.match(basic,/display:inline-flex/);
 assert.match(basic,/justify-content:center/);
 assert.match(basic,/width:104px/);
 assert.match(basic,/min-width:104px/);
 assert.match(basic,/max-width:104px/);
 assert.match(basic,/height:24px/);
 assert.match(basic,/min-height:24px/);
 assert.match(basic,/max-height:24px/);
 assert.match(basic,/box-sizing:border-box/);
 assert.match(basic,/white-space:nowrap/);
 for(const status of ['actief','verlof','inactief','fifty-fifty','non-actief','verwijderd']){
  const override=css.match(new RegExp('\\.mr-table \\.mr-status--'+status+'\\{([^}]+)\\}'))?.[1]||'';
  assert.match(override,/background:#[0-9a-f]{6}/);
  assert.match(override,/border-color:#[0-9a-f]{6}/);
  assert.match(override,/color:#[0-9a-f]{6}/);
  assert.doesNotMatch(override,/width:|height:|padding:/);
 }
});

test('read-only personnel list preserves original status text but applies safe CSS class',()=>{
 assert.match(js,/policeRosterStatusStyle\(status\)/);
 assert.match(js,/mr-status mr-status--/);
 assert.match(js,/person\.status\|\|'Onbekend'/);
 assert.match(js,/mr-status-cell/);
 // Both lower-cadre and officers see the shared read-only renderer.
 assert.match(page,/from '\/member-police-roster\.js'/);
 assert.match(dashboard,/from '\/member-police-roster\.js'/);
});

test('officer-adjustable text size cannot overflow fixed status boxes',()=>{
 assert.match(page,/font-size:min\(var\(--mr-custom-text-size,11px\),12px\)/);
 assert.doesNotMatch(js,/person\.status\s*=/);
});
