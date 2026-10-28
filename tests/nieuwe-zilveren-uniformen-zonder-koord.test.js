import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../public/',import.meta.url);
const page=readFileSync(new URL('uniformen-nieuw-zilver-proef.html',root),'utf8');

test('new silver TEST coat is an isolated actual WebP, separate from MAIN',()=>{
 const bytes=readFileSync(new URL('assets/bpd-uniform-zilver-zonder-koord-nieuw-20261028.webp',root));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.ok(bytes.length>35000,'Use the sharp asset, never the old 200px preview');
 assert.match(page,/bpd-uniform-zilver-zonder-koord-nieuw-20261028\.webp/);
 assert.match(page,/zonder koord/i);
 assert.doesNotMatch(page,/https:\/\/.*bpd-uniform/);
});

test('all 3 cadres are present and grade mapping follows the current call automatically',()=>{
 for(const cadre of ['Middenkader','Basiskader','Agentenkader'])assert.match(page,new RegExp(cadre));
 for(const g of ['1hinp','hinp','ahinp','1inp','inp','ainp','ap'])
  assert.ok(page.includes("asset:'"+g+"'"),g);
 assert.match(page,/function grade\(call\)/);
 assert.match(page,/return n>=800\?'1hinp'/);
 assert.match(page,/n>=500\?'1inp'/);
 assert.match(page,/n>=300\?'ainp':'ap'/);
 assert.match(page,/assets\/bpd-rank-/);
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
});

test('approved woven nameplate is reused with dynamic name + BELGIEPD - call',()=>{
 const plate=readFileSync(new URL('assets/bpd-naamplaat-geweven-leeg-20261028.webp',root));
 assert.equal(plate.toString('ascii',0,4),'RIFF');
 assert.match(page,/bpd-naamplaat-geweven-leeg-20261028\.webp/);
 assert.match(page,/person-name/);
 assert.match(page,/person-call/);
 assert.match(page,/toLocaleUpperCase\('nl'\)/);
 assert.match(page,/textContent='BELGIEPD - '\+call/);
 assert.match(page,/De originele geborduurde rangafbeeldingen worden rechtstreeks op TEST geladen/);
});
test('new independent proof never writes data, accesses secured APIs or changes MAIN',()=>{
 assert.match(page,/losstaande TEST-proef/);
 assert.doesNotMatch(page,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
 assert.doesNotMatch(page,/api\/|firebase|discordId|idToken|Authorization:/i);
 const html=readFileSync(new URL('organogram-test.html',root),'utf8');
 assert.ok(html.includes('organogram-police-formal.js'), 'existing TEST organogram remains present');
});
