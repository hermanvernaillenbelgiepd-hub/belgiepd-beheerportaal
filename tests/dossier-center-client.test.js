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


test('The MAIN dossier list shows callsign, grade and status in separate columns',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  const view=readFileSync(new URL('../public/dossiercentrum-view.js',import.meta.url),'utf8');
  assert.match(html,/<th>Naam<\/th><th>Roepnummer<\/th><th>Graad<\/th><th>Dienst<\/th><th>Status<\/th><th>Discord-ID<\/th><th>Actie<\/th>/);
  assert.ok(html.includes("node('span',r.call||'—','dossier-callsign')"));
  assert.ok(html.includes("node('span',r.rank||'—','dossier-rank')"));
  assert.ok(html.includes("node('span',r.status||'—','dossier-status')"));
  assert.ok(html.includes("cell.colSpan=7"));
  assert.ok(view.includes("[r.name,r.call,r.rank,r.status,r.discordId]"));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});
