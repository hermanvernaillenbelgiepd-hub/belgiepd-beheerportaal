import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/testgegevens-opschonen.html',import.meta.url),'utf8');
const beheer=readFileSync(new URL('../public/beheercentrum.html',import.meta.url),'utf8');

test('cleanup link exists only for the verified technical beheer profile',()=>{
 assert.match(beheer,/<a class="tile" id="cleanupTile"[^>]*hidden/);
 assert.match(beheer,/\$\('cleanupTile'\)\.hidden=!next\.canEdit/);
 assert.match(html,/\/api\/technical-cleanup\/access/);
});

test('cleanup UI requires per-person selection, reason and typed confirmation',()=>{
 for(const id of ['dept','search','subjects','entryPanel','auditPanel','actionForm',
  'actionReason','actionConfirm','actionSubmit','actionDialog'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/confirm:word/);
 assert.match(html,/const word=action==='restore'\?'HERSTELLEN':'INTREKKEN'/);
 assert.match(html,/\/api\/technical-cleanup\/entries\?/);
 assert.match(html,/\/api\/technical-cleanup\/audit\?/);
 assert.doesNotMatch(html,/\b(?:permanent|definitief) verwijderen\b/i);
});

test('cleanup UI has unique IDs and browser JS parses',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,new Set(ids).size);
 const script=/<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new Function(script));
});
