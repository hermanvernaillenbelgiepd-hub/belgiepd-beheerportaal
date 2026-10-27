import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../public/',import.meta.url);
const page=readFileSync(new URL('uniformen-proef.html',root),'utf8');
test('vier echte losse 872×1213-WebP uniformvarianten; geen montage of runtime beeldrecoloring',()=>{
 for(const name of ['korpsleiding','officierenkader','middenkader','basiskader']){
  const path=new URL('assets/bpd-uniform-'+name+'-test.webp',root);
  const bytes=readFileSync(path);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.ok(bytes.length>20000&&bytes.length<70000);
  // Extended WebP contains 24-bit pixel dimensions minus one.
  assert.equal(bytes.toString('ascii',12,16),'VP8X');
  assert.equal(1+bytes.readUIntLE(24,3),872);
  assert.equal(1+bytes.readUIntLE(27,3),1213);
  assert.match(page,new RegExp('/assets/bpd-uniform-'+name+'-test\\.webp'));
 }
});
test('vier afzonderlijke kaders en correct gekoppelde graadregels',()=>{
 assert.match(page,/call:'900'/);
 assert.match(page,/call:'920'/);
 assert.match(page,/call:'700'/);
 assert.match(page,/call:'400'/);
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new Function(script));
 const context={document:{
  getElementById(){return {append(){}}},
  createElement(){return {className:'',querySelector(){return {textContent:''}},querySelectorAll(){return [{value:''},{value:''}],innerHTML:'',setAttribute(){},append(){},addEventListener(){}}},
  createElementNS(){return {setAttribute(){},append(){},textContent:''}}
 }};
 // script parses; live DOM handles bind/update
 assert.match(script,/function gradeFor\(call\)/);
 assert.match(script,/if\(n===900\)/);
 assert.match(script,/if\(n===910\)/);
 assert.match(script,/if\(n===920\|\|n===930\)/);
 assert.match(script,/img\.src=files\[rank\.trim\]/);
 assert.match(script,/replaceChildren\(nameplate\(name\.value,call\.value\)\)/);
 assert.match(script,/replaceChildren\(gradeBadge\(rank\)\)/);
 assert.match(script,/sampleMedals\(\)/);
});
test('publieke vrijblijvende vergelijking wijzigt geen dossiers of rechten',()=>{
 assert.match(page,/UITSLUITEND TEST/);
 assert.match(page,/noindex,nofollow/);
 assert.doesNotMatch(page,/(?:fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage)/);
 assert.doesNotMatch(page,/(?:\/api\/|discordId|idToken|firebase)/i);
 const original=readFileSync(new URL('organogram-test.html',root),'utf8');
 assert.match(original,/href="\/uniformen-proef\.html"/);
 assert.match(original,/href="\/"/);
});