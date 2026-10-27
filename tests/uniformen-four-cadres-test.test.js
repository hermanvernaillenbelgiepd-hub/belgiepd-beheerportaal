import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
const page=readFileSync(new URL('uniformen-proef.html',root),'utf8');

test('vier originele 872×1213-WebP bestanden blijven beschikbaar als herstelbron',()=>{
 for(const name of ['korpsleiding','officierenkader','middenkader','basiskader']){
  const bytes=readFileSync(new URL('assets/bpd-uniform-'+name+'-test.webp',root));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.ok(bytes.length>20000&&bytes.length<110000);
  assert.equal(bytes.toString('ascii',12,16),'VP8X');
  assert.equal(1+bytes.readUIntLE(24,3),872);
  assert.equal(1+bytes.readUIntLE(27,3),1213);
 }
});

test('politie-roepnummers wisselen demonstratie-uniform en borstgraad zonder serverdata',()=>{
 for(const call of ['900','920','700','400'])assert.ok(page.includes("call:'"+call+"'"),call);
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new Function(script));
 assert.match(script,/function gradeFor\(call\)/);
 assert.match(script,/if\(n===900\)/);
 assert.match(script,/if\(n===920\|\|n===930\)/);
 assert.match(script,/if\(rank\.trim==='gold-slim'\)/);
 assert.match(script,/officerWithoutShoulders\(\)\.then/);
 assert.match(script,/img\.src=files\[rank\.trim\]/);
 assert.match(script,/replaceChildren\(nameplate\(name\.value,call\.value\)\)/);
 assert.match(script,/replaceChildren\(gradeBadge\(rank\)\)/);
 assert.match(script,/sampleMedals\(\)/);
});

test('alleen TEST, geen dossier- of autorisatiewijzigingen',()=>{
 assert.match(page,/UITSLUITEND TEST/);
 assert.match(page,/noindex,nofollow/);
 assert.doesNotMatch(page,/(?:fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage)/);
 assert.doesNotMatch(page,/(?:\/api\/|discordId|idToken|firebase)/i);
 const organogram=readFileSync(new URL('organogram-test.html',root),'utf8');
 assert.match(organogram,/href="\/uniformen-proef\.html"/);
});
