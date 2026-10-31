import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
const singleRow=css.match(/\.service\[data-dept="brandweer"\]>\.service-body>\.spec-list\{([^}]+)\}/)?.[1]||'';

test('brandweer specialties stay on one horizontal row and scroll instead of wrapping',()=>{
 assert.ok(singleRow,'brandweer-only layout must exist');
 assert.match(singleRow,/grid-auto-flow:column/);
 assert.match(singleRow,/grid-template-columns:none/);
 assert.match(singleRow,/grid-auto-columns:270px/);
 assert.match(singleRow,/overflow-x:auto/);
 assert.match(singleRow,/max-width:100%/);
 assert.doesNotMatch(singleRow,/flex-wrap:wrap|repeat\(auto-fit/);
 assert.match(css,/\.service\[data-dept="brandweer"\]>\.service-body>\.spec-list>\.specialty/);
});
test('scroll row includes every fire specialty branch and remaining members',()=>{
 assert.match(html,/const specs=el\('div','spec-list'\)/);
 assert.match(html,/for\(const branch of item\.branches\)specs\.append\(specialtyBranch\(branch,false\)\)/);
 assert.match(html,/specs\.tabIndex=0/);
 assert.match(html,/Brandweerspecialisaties op één horizontale rij/);
});
test('layout remains scoped to fire brigade; all other service grids remain responsive',()=>{
 assert.match(css,/\.spec-list\{display:grid;grid-template-columns:repeat\(auto-fit/);
 assert.doesNotMatch(singleRow,/\[data-dept="ambulance"\]|\[data-dept="depannage"\]|\[data-dept="politie"\]/);
 assert.match(css,/@media\(max-width:650px\)\{/);
});
