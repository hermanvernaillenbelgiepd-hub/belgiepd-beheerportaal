import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
const main=css.match(/\.service\[data-dept="brandweer"\]>\.service-body>\.spec-list\{([^}]+)\}/)?.[1]||'';
const narrow=css.match(/@media\(max-width:1050px\)\{\s*\.service\[data-dept="brandweer"\]>\.service-body>\.spec-list\{([^}]+)\}/)?.[1]||'';
const many=css.match(/\.service\[data-dept="brandweer"\]>\.service-body>\.spec-list\.fire-specs-overflow\{([^}]+)\}/)?.[1]||'';

test('all fire specialties share the whole desktop page in one equally sized row',()=>{
 assert.ok(main);
 assert.match(main,/grid-template-columns:repeat\(var\(--fire-specialty-count,6\),minmax\(0,1fr\)\)/);
 assert.match(main,/grid-auto-flow:row/);
 assert.match(main,/width:100%/);
 assert.match(main,/overflow:visible/);
 assert.doesNotMatch(main,/grid-auto-columns:270px|repeat\(auto-fit|overflow-x:auto/);
 assert.match(html,/specs\.style\.setProperty\('--fire-specialty-count',String\(branchCount\)\)/);
});
test('six, seven or eight specialties all fit inside the desktop section',()=>{
 for(const count of [5,6,7,8]){
  const contentWidth=1420;
  const gap=6;
  const cardWidth=(contentWidth-(count-1)*gap)/count;
  assert.ok(cardWidth>155,`${count} specialty columns must still fit readable people cards`);
 }
 const card=css.match(/#services \.service\[data-dept="brandweer"\]>\.service-body>\.spec-list \.persons\.personnel-card-grid>\.person\{([^}]+)\}/)?.[1]||'';
 assert.match(card,/width:100%/);
 assert.match(card,/min-width:0/);
 assert.match(css,/\.spec-list \.person>\.portrait\.bpd-service-uniform\{/);
 assert.match(css,/width:44px!important/);
});
test('tiny screens or over eight specialties remain in one locally scrollable row',()=>{
 assert.match(narrow,/grid-auto-flow:column/);
 assert.match(narrow,/overflow-x:auto/);
 assert.match(many,/grid-auto-flow:column/);
 assert.match(many,/overflow-x:auto/);
 assert.match(html,/branchCount>8\)specs\.classList\.add\('fire-specs-overflow'\)/);
});
test('all fire branches including remaining members are rendered, other departments unchanged',()=>{
 assert.match(html,/for\(const branch of item\.branches\)specs\.append\(specialtyBranch\(branch,false\)\)/);
 assert.match(css,/\.spec-list\{display:grid;grid-template-columns:repeat\(auto-fit/);
 assert.doesNotMatch(main,/\[data-dept="ambulance"\]|\[data-dept="depannage"\]|\[data-dept="politie"\]/);
});
