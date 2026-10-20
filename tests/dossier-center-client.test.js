import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

test('Dossier center browser script parses as JavaScript',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,'inline browser module exists');
  const inline=match[1].replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s*'\/dossiercentrum-view\.js';/,'');
  assert.doesNotThrow(()=>new Script(inline,{filename:'dossiercentrum.html'}));
});
test('Dossier UI renders fetched data as text and cannot grant access',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.ok(html.includes('textContent'));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
  assert.equal(/fetch\([^)]*method:\s*['"]POST/.test(html),false);
});

test('Dossier controls offer authorised filters and paginated results',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  for(const id of ['query','department','historyKind','nextPage','previousPage','stats'])
    assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
  assert.ok(html.includes("from '/dossiercentrum-view.js'"));
  assert.ok(html.includes('detailLinks(data)'));
  assert.equal(html.includes('burgerdossier'),false);
  assert.equal(html.includes('sollicitatiebeheer'),false);
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});
