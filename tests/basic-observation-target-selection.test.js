import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');

test('Only exact string Discord IDs are eligible for Basiskader target selection',()=>{
 const helper=page.match(/const validTargetId=value=>[^\n]+;\nconst normalizeTargetId=value=>[^\n]+;/)?.[0];
 assert.ok(helper,'explicit ID validation helpers are present');
 const {validTargetId,normalizeTargetId}=new Function(helper+
  '\nreturn {validTargetId,normalizeTargetId};')();
 assert.equal(validTargetId('123456789012345678'),true);
 assert.equal(validTargetId('123456789012345'),true);
 assert.equal(validTargetId('208'),false,'callsign must never replace target Discord-ID');
 assert.equal(validTargetId(''),false);
 assert.equal(validTargetId(undefined),false);
 assert.equal(validTargetId(123456789012345678),false,
   'number coercion can irreversibly change 18-digit Discord IDs');
 assert.equal(validTargetId('123456789012345678 '),false);
 assert.equal(normalizeTargetId(' 123456789012345678 '),'123456789012345678');
});

test('User must explicitly choose a valid displayed target; errors clear when corrected',()=>{
 assert.match(page,/id="target" required aria-describedby="targetCount selectedTargetInfo"/);
 assert.match(page,/empty\.disabled=true/);
 assert.match(page,/empty\.selected=true/);
 assert.match(page,/filter\(p=>validTargetId\(p\.discordId\)\)/);
 assert.match(page,/opt\.value=normalizeTargetId\(item\.discordId\)/);
 assert.match(page,/const target=normalizeTargetId\(\$\('target'\)\.value\)/);
 assert.match(page,/if\(!target\)return setMessage\('Kies eerst een betrokken personeelslid/);
 assert.match(page,/context\.targets\?\.some\(p=>/);
 assert.match(page,/addEventListener\('change',\(\)=>\{/);
 assert.match(page,/if\(\$\('message'\)\.classList\.contains\('error'\)\)setMessage\(''\)/);
});

test('Server separately validates missing vs malformed target ID; rank scope remains enforced',()=>{
 assert.match(api,/typeof body\.discordId!=='string'\|\|!body\.discordId\.trim\(\)/);
 assert.match(api,/if\(!ID\.test\(body\.discordId\)\)/);
 assert.match(api,/De geselecteerde personeelsfiche heeft geen geldig Discord-ID/);
 assert.match(api,/access\.targets\.filter\(p=>p\.personId===body\.discordId\)/);
 assert.match(api,/!access\.author\|\|targets\.length!==1/);
 assert.match(api,/Je kunt enkel politieleden van een lagere rang observeren/);
 assert.match(api,/getFirestore\(\)/);
});
