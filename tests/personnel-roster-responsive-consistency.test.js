import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('desktop full specialization matrix remains available at ordinary laptop widths',()=>{
 const css=read('public/member-police-roster.css');
 assert.match(css,/@media\(min-width:1025px\) and \(max-width:1450px\)/);
 assert.doesNotMatch(css,/@media\(min-width:1025px\) and \(max-width:1800px\)/);
 assert.match(css,/\.mr-scroll > \.mr-table\{display:none!important\}/);
 const html=read('public/personeelslijst.html');
 assert.match(html,/@media\(min-width:768px\) and \(max-width:2200px\)/);
 assert.match(html,/table-layout:fixed!important/);
 assert.match(html,/colgroup col\{\s*width:auto!important/);
 assert.match(html,/overflow-x:clip!important/);
 assert.match(html,/@media\(min-width:768px\) and \(max-width:1024px\)/);
 assert.match(html,/mr-col-toolbar,[\s\S]*mr-col-handle\{\s*display:none!important/);
});
test('small-screen roster keeps all specialization values accessible in expandable detail rows',()=>{
 const css=read('public/member-police-roster.css');
 assert.match(css,/@media\(max-width:1024px\)/);
 assert.match(css,/body\.roster-personnel-page \.mr-scroll > \.mr-mobile-roster/);
 const roster=read('public/member-police-roster.js');
 assert.match(roster,/for\(let index=5;index<sourceCells\.length;index\+\+\)/);
 assert.match(roster,/toggle\.setAttribute\('aria-expanded'/);
});
