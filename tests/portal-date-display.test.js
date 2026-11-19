import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatDisplayDay,formatVisibleDateText} from '../public/display-date-policy.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Alle diensten tonen ISO-dagen als DD/MM/JJJJ, zonder ISO-opslag te wijzigen',()=>{
 assert.equal(formatDisplayDay('2026-11-19'),'19/11/2026');
 assert.equal(formatDisplayDay('2026-02-31'),'2026-02-31');
 assert.equal(formatDisplayDay('2024-02-29'),'29/02/2024');
 assert.equal(formatVisibleDateText('Datum: 2026-11-19 · tot 2026-12-01'),
  'Datum: 19/11/2026 · tot 01/12/2026');
 assert.equal(formatVisibleDateText('2026-11-19T10:45:31Z'),
  '19/11/2026 11:45:31');
 assert.equal(formatVisibleDateText('vanaf 19/11/2026'),'vanaf 19/11/2026');
 assert.equal(formatVisibleDateText('geen datums'),'geen datums');
});
test('Algemene navigatie laadt datumweergave ook in ingebedde diensten; formulieren blijven ISO',()=>{
 const nav=source('public/bpd-navigation.js');
 const formatter=source('public/bpd-display-dates.js');
 assert.ok(nav.includes("dateScript.src='/bpd-display-dates.js'"));
 assert.ok(nav.indexOf('dateScript.src=')<nav.indexOf('if(window.self!==window.top)'));
 assert.ok(formatter.includes('new MutationObserver'));
 assert.ok(formatter.includes('textarea,select,option'));
 assert.ok(formatter.includes("document.documentElement.lang='nl-BE'"));
});
