import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRetired} from '../src/dossier-retirement-policy.js';
const source=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
test('Dossier read-after-write has imported isRetired before filtering saved notes',()=>{
 assert.match(source,/import\s*\{[^}]*\bisRetired\b[^}]*\}\s*from\s*['"]\.\/dossier-retirement-policy\.js['"]/);
 assert.match(source,/app\.get\(['"]\/api\/management\/cases['"]/);
 assert.match(source,/\.filter\(d=>!isRetired\(d\.data\(\)\)\)/);
 assert.match(source,/res\.json\(\{subject:\{dept,discordId:id,name:subject\.name,call:subject\.call\}/);
 assert.equal(isRetired({status:'actief'}),false);
 assert.equal(isRetired({status:'verwijderd'}),true);
 assert.equal(isRetired({retired:{at:'2026-11-19'}}),true);
});
