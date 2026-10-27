import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/uniformen-proef.html',import.meta.url),'utf8');

test('TEST - uitsluitend Korpsleiding heeft schouderstukken',()=>{
 assert.match(html,/Korpsleiding',description:'Brede gouden schouderstukken/);
 assert.match(html,/Officierenkader',description:'Geen schouderstukken · gouden accenten/);
 assert.match(html,/Middenkader',description:'Geen schouderstukken · zilveren accenten/);
 assert.match(html,/Basis- en agentenkader',description:'Geen schouderstukken · zilver/);
 assert.match(html,/'silver-hair':'\/assets\/bpd-uniform-basiskader-test\.webp/);
 assert.match(html,/'silver-none':'\/assets\/bpd-uniform-basiskader-test\.webp/);
 assert.match(html,/'gold-wide':'\/assets\/bpd-uniform-korpsleiding-test\.webp/);
});

test('officieren worden als één vlak beeld getoond zonder losse extra laag',()=>{
 assert.match(html,/const canvas=document\.createElement\('canvas'\)/);
 assert.match(html,/ctx\.drawImage\(original,0,0\)/);
 assert.match(html,/ctx\.fillStyle='#1c3860'/);
 assert.match(html,/ctx\.closePath\(\);ctx\.fill\(\)/);
 assert.match(html,/canvas\.toDataURL\('image\/webp',\.89\)/);
 assert.match(html,/const rank=gradeFor\(call\.value\),generation=\+\+imageGeneration/);
 assert.match(html,/if\(rank\.trim==='gold-slim'\)/);
 assert.match(html,/officerWithoutShoulders\(\)\.then/);
 assert.doesNotMatch(html,/\/api\/|XMLHttpRequest|localStorage|sessionStorage/);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Function(js));
});
