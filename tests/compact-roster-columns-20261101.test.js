import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('public police filter has no redundant kaderindeling notice',()=>{
 const html=read('public/personeelslijst.html');
 assert.doesNotMatch(html,/Vaste kaderindeling/);
 assert.match(html,/<label for="search">Zoeken<\/label>/);
 assert.match(html,/<button id="refresh"/);
});

test('police listing legacy saved table width does not force horizontal desktop scroll',()=>{
 const html=read('public/personeelslijst.html');
 assert.match(html,/\.roster-personnel-page \.mr-table\{width:100%;min-width:0;table-layout:fixed\}/);
 assert.match(html,/@media\(max-width:1099px\)/);
 assert.match(html,/\.roster-personnel-page \.mr-table\{min-width:1100px\}/);
 assert.doesNotMatch(html,/\.mr-table\{min-width:var\(--mr-custom-table-width/);
 assert.match(html,/\.mr-table th:nth-child\(3\),\s*\.roster-personnel-page \.mr-table th:nth-child\(4\)\{min-width:0\}/);
});

test('call, series, status narrower on all police rosters without erasing status cells',()=>{
 const css=read('public/member-police-roster.css');
 assert.match(css,/\.mr-table th:first-child\{width:3\.7%;min-width:0\}/);
 assert.match(css,/\.mr-table th:nth-child\(4\)\{width:4\.8%;min-width:0\}/);
 assert.match(css,/\.mr-table th:nth-child\(5\)\{width:6\.1%;min-width:0\}/);
 assert.match(css,/\.mr-table td\.mr-status-cell \.mr-status\{/);
 const html=read('public/personeelsbeheer.html');
 assert.match(html,/Math\.min\(w\.call,44\)/);
 assert.match(html,/Math\.min\(w\.series,62\)/);
 assert.match(html,/Math\.min\(w\.status,76\)/);
 assert.match(html,/const widths=\[w\.call,w\.grade/);
 assert.match(html,/roster-police-compact/);
});
