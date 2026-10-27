import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync(new URL('../public/uniformen-proef.html',import.meta.url),'utf8');
const inline=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

test('TEST proef: geen schouderstukken bij korpsleiding, officieren, midden of lager kader',()=>{
  assert.ok(inline,'Inline script moet bestaan');
  assert.doesNotThrow(()=>new vm.Script(inline));
  // The former golden shoulderboard jacket must never be displayed.
  assert.doesNotMatch(page,/bpd-uniform-korpsleiding-test\.webp/);
  assert.match(page,/'gold-wide':'\/assets\/bpd-uniform-officierenkader-test\.webp/);
  assert.match(page,/'gold-slim':'\/assets\/bpd-uniform-officierenkader-test\.webp/);
  assert.match(page,/if\(rank\.trim==='gold-slim'\|\|rank\.trim==='gold-wide'\)/);
  assert.match(page,/goldUniformWithoutShoulders\(\)\.then/);
  assert.match(page,/img\.style\.visibility='hidden'/);
  assert.match(page,/'silver-hair':'\/assets\/bpd-uniform-basiskader-test\.webp/);
  assert.match(page,/'silver-none':'\/assets\/bpd-uniform-basiskader-test\.webp/);
  assert.doesNotMatch(page,/officerWithoutShoulders\(/);
  assert.match(page,/alle politiekaders: geen schouderstukken/);
});

test('Dynamische naamplaat en graad behouden bij elke personeelswijziging',()=>{
  assert.match(page,/function gradeFor\(call\)/);
  assert.match(page,/if\(n===900\).*gold-wide/);
  assert.match(page,/if\(n===910\).*gold-wide/);
  assert.match(page,/if\(n===920\|\|n===930\).*gold-slim/);
  assert.match(page,/if\(n>=700&&n<800\).*silver-hair/);
  assert.match(page,/if\(n>=400&&n<500\).*silver-none/);
  assert.match(page,/nm\.replaceChildren\(nameplate\(name\.value,call\.value\)\)/);
  assert.match(page,/badge\.replaceChildren\(gradeBadge\(rank\)\)/);
  assert.match(page,/img\.alt='Ceremonieel politie-uniform: '\+rank\.label/);
});
