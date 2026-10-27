import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/uniformen-proef.html',import.meta.url),'utf8');
test('Vier afgewerkte uniformvarianten staan uitsluitend in de TEST-proef',()=>{
 assert.match(html,/UITSLUITEND TEST/);
 assert.match(html,/geen personeelswijzigingen/i);
 assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|localStorage\.setItem/);
 for(const name of ['korpsleiding','officierenkader','middenkader','basiskader']){
  const url='/assets/bpd-uniform-'+name+'-test.webp?v=schouders-v4';
  assert.ok(html.includes(url),name);
  const file=readFileSync(new URL('../public/assets/bpd-uniform-'+name+'-test.webp',import.meta.url));
  assert.equal(file.toString('ascii',0,4),'RIFF',name);
  assert.equal(file.toString('ascii',8,12),'WEBP',name);
  assert.ok(file.length>40000 && file.length<110000,name+' unexpected size');
 }
 const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(source);
 assert.doesNotThrow(()=>new Function(source));
});
test('Rangen en uniformen volgen een gewijzigde call, zonder gegevens weg te schrijven',()=>{
 assert.match(html,/const rank=gradeFor\(call\.value\);img\.src=files\[rank\.trim\]/);
 assert.match(html,/n===900[\s\S]*?gold-wide/);
 assert.match(html,/n===920\|\|n===930[\s\S]*?gold-slim/);
 assert.match(html,/n>=600&&n<700[\s\S]*?silver-hair/);
 assert.match(html,/n>=300&&n<400[\s\S]*?silver-none/);
});
