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


test('Dossier user interface labels each selected service independently',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.ok(html.includes("afzonderlijk personeelsdossier · '+r.name"));
  assert.ok(html.includes("Dit is uitsluitend het dossier van "));
  assert.ok(html.includes("Andere hulpdiensten beheren hun eigen afzonderlijke dossier"));
});


test('Large police, ambulance, fire and recovery buttons appear in TEST but obey authorized department scope',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  for(const service of ['all','politie','ambulance','brandweer','depannage']){
    assert.ok(html.includes('data-service="'+service+'"'),'Missing service button '+service);
  }
  assert.ok(html.includes('id="serviceButtons"'));
  assert.ok(html.includes("const permitted=new Set(allowed)"));
  assert.ok(html.includes("button.disabled=!accessible"));
  assert.ok(html.includes("permitted.has(dept)"));
  assert.ok(html.includes("selectDepartment(button.dataset.service)"));
  assert.ok(html.includes("if(![...item.options].some(option=>option.value===dept))return"));
  assert.ok(html.includes("closeDossier();changedFilters()"));
});
test('Actual dossier view includes working, separately scoped fiche and history controls',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.ok(html.includes('data-dossier-tab="fiche"'));
  assert.ok(html.includes('data-dossier-tab="historiek"'));
  assert.ok(html.includes('id="dossierFiche"'));
  assert.ok(html.includes('id="dossierHistoriek"'));
  assert.ok(html.includes("switchDossierTab('fiche')"));
  assert.ok(html.includes("function switchDossierTab(next)"));
  assert.ok(html.includes("'🔒 '+(departments[r.dept]||r.dept)"));
  assert.ok(html.includes("if(shown!==active)return"));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});
