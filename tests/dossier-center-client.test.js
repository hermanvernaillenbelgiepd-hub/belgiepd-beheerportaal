import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

test('Dossier center browser script parses as JavaScript',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,'inline browser module exists');
  assert.doesNotThrow(()=>new Script(match[1],{filename:'dossiercentrum.html'}));
});
test('Dossier UI renders fetched data as text and cannot grant access',()=>{
  const html=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.ok(html.includes('textContent'));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
  assert.equal(/fetch\([^)]*method:\s*['"]POST/.test(html),false);
});
