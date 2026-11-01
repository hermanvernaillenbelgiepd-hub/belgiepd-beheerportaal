import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('police management roster has five identity columns, keeping rank in tooltip',()=>{
 const html=source('public/personeelsbeheer.html');
 assert.match(html,/const showRankName=dept!=='politie',policeCompact=!showRankName/);
 assert.match(html,/\['CALL','Rangkenteken','Personeelslid','Reeks','Status'\]/);
 assert.match(html,/if\(showRankName\)\{\s*const rankCell=td\(tr,grade.label\)/);
 assert.match(html,/gradeDisplay.title=grade.label/);
 assert.match(html,/const fullColumnCount=baseColumnCount\+Math.max\(cols.length,1\)\+2/);
 assert.equal(html.match(/\.colSpan=fullColumnCount/g)?.length,3);
});

test('police management widths are responsive without rewriting saved Firestore widths',()=>{
 const html=source('public/personeelsbeheer.html');
 assert.match(html,/const compactWidths=policeCompact\?/);
 assert.match(html,/col.style.width=policeCompact\?/);
 assert.match(html,/\(100\*width\/compactTotal\)\.toFixed\(4\)\+'%'/);
 assert.match(html,/table\.classList\.toggle\('roster-police-compact',policeCompact\)/);
 assert.match(html,/table.style.minWidth=policeCompact\?'1100px':'0'/);
 assert.match(html,/\.staff-roster-table\.roster-police-compact th\.specialty-col-head--patch\{/);
 assert.match(html,/rosterDragHandles\(\{dept,cols,headers:line,colgroup,table,widths,showRankName\}\)/);
});

test('member lists remove redundant rank label while retaining insignia and patch columns',()=>{
 const script=source('public/member-police-roster.js');
 const css=source('public/member-police-roster.css');
 assert.doesNotMatch(script,/NAAM VAN RANG/);
 assert.match(script,/wrap\.title=info\.label\|\|'Rang onbekend'/);
 assert.match(script,/cell\.colSpan=5\+visibleSpecialties\(\)\.length/);
 assert.match(script,/return people\.length/);
 assert.match(css,/\.mr-table\{\s*width:100%;min-width:0;table-layout:fixed;/);
 assert.match(css,/\.mr-table th\.mr-specialty-head--patch\{\s*min-width:0!important;/);
 assert.match(css,/@media\(max-width:1099px\)/);
});

test('personnel admin inline scripts remain syntactically valid',()=>{
 const html=source('public/personeelsbeheer.html');
 const scripts=[...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
 assert.ok(scripts.length);
 for(const [,script] of scripts)
  assert.doesNotThrow(()=>new Script(script.replace(/^import [^\n]*\n/gm,'')));
});
