import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('personnel management roster opts out of the adaptive card layout at all widths',()=>{
 const page=read('public/personeelsbeheer.html');
 const nav=read('public/bpd-navigation.js');
 assert.match(page,/<table class="staff-roster-table" data-bpd-table-layout="always">/);
 assert.match(nav,/const fixedAdminMatrix=table\.classList\.contains\('staff-roster-table'\)/);
 assert.match(nav,/table\.closest\('#staffManagePanel'\)/);
 assert.match(nav,/table\.dataset\.bpdTableLayout==='always'/);
 assert.match(nav,/if\(fixedAdminMatrix\)\{\s*table\.classList\.remove\('bpd-adaptive-cards'\);\s*return;/);
 assert.doesNotMatch(nav,/document\.documentElement\.clientWidth>=900/);
});

test('narrow personnel roster keeps the real table and scrolls inside its own holder',()=>{
 const page=read('public/personeelsbeheer.html');
 assert.match(page,/\.staff-roster-holder\{[^}]*overflow-x:auto/);
 assert.match(page,/@media\(max-width:1279px\)\{\s*\.staff-roster-table\.roster-police-compact\{min-width:1280px\}/);
 assert.match(page,/<thead id="staffColumnHeaders"><\/thead><tbody id="results"><\/tbody>/);
 assert.match(page,/src="\/bpd-navigation\.js\?v=20261119-consistent-roster"/);
 const nav=read('public/bpd-navigation.js');
 const start=nav.indexOf('  function adapt(table){');
 const end=nav.indexOf('  function attach(table){',start);
 assert.ok(start>=0&&end>start);
 const block=nav.slice(start,end);
 const skip=block.indexOf('if(fixedAdminMatrix)');
 const adaptive=block.indexOf("table.classList.toggle('bpd-adaptive-cards'");
 assert.ok(skip>0&&adaptive>skip,'Fixed table must return before adaptive cards can be applied');
});

test('other directory tables retain the existing adaptive behavior',()=>{
 const nav=read('public/bpd-navigation.js');
 assert.match(nav,/const selector='table\.mr-table,table\.staff-roster-table'/);
 assert.match(nav,/table\.classList\.toggle\('bpd-adaptive-cards',available<required\+12\)/);
});
