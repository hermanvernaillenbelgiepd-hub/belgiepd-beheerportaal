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

test('Basiskader finds eligible staff by callsign or name in a compact read-only list',()=>{
 const functions=page.match(/const normalizeRosterSearch=value=>[\s\S]*?const TARGET_RESULT_LIMIT=60;/)?.[0];
 assert.ok(functions,'search normalization and filtering are available');
 const {filterRosterTargets}=new Function(functions+
   '\nreturn {filterRosterTargets};')();
 const people=[
  {call:'SANTO-285',name:'Éloïse Dupont',rank:'Agent'},
  {call:'SANTO-341',name:'Bram Verhoeven',rank:'Aspirant inspecteur'},
  {call:'452',name:'Sébastien Janssens',rank:'Inspecteur'}
 ];
 assert.deepEqual(filterRosterTargets(people,'285').map(x=>x.call),['SANTO-285']);
 assert.deepEqual(filterRosterTargets(people,'ÉLO').map(x=>x.call),['SANTO-285']);
 assert.deepEqual(filterRosterTargets(people,'sebastien').map(x=>x.call),['452']);
 assert.deepEqual(filterRosterTargets(people,'BRAM').map(x=>x.call),['SANTO-341']);
 assert.deepEqual(filterRosterTargets(people,'niet aanwezig'),[]);
 assert.equal(filterRosterTargets(people,'').length,3);
 assert.match(page,/id="targetSearch" type="search"/);
 assert.match(page,/id="targetList" class="target-roster" role="group"/);
 assert.match(page,/target-roster-head[\s\S]*?<span>CALL<\/span><span>NAAM<\/span><span>RANG<\/span>/);
 assert.match(page,/const targets=\[\.\.\.\(data\.targets\|\|\[\]\)\]\.filter\(p=>validTargetId\(p\.discordId\)\)/);
 assert.match(page,/selectableTargets=targets/);
 assert.match(page,/option\.addEventListener\('click',\(\)=>\{/);
 assert.match(page,/\$\('target'\)\.dispatchEvent\(new Event\('change'/);
 assert.match(page,/\$\('formPanel'\)\.hidden=!data\.canSubmit/);
 assert.match(page,/const target=normalizeTargetId\(\$\('target'\)\.value\)/);
 assert.match(page,/context\.targets\?\.some\(p=>/);
 assert.match(page,/TARGET_RESULT_LIMIT=60/);
 assert.match(page,/@media\(max-width:550px\)/);
});
