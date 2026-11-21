import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicStaticCacheControl} from '../src/static-cache-policy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('safe static assets revalidate; protected html never cached',()=>{
 assert.equal(publicStaticCacheControl('/app/public/organogram-hierarchie.html'),'no-store');
 assert.equal(publicStaticCacheControl('/app/public/dossiercentrum.html'),'no-store');
 assert.equal(publicStaticCacheControl('/app/public/bpd-navigation.js'),'private, no-cache, must-revalidate');
 assert.equal(publicStaticCacheControl('/app/public/assets/logo.svg'),'private, no-cache, must-revalidate');
 assert.equal(publicStaticCacheControl('/app/public/report.pdf'),'no-store');
 assert.equal(publicStaticCacheControl('/app/public/secret.json'),'no-store');
 assert.equal(publicStaticCacheControl(null),'no-store');
 const server=read('src/server.js');
 assert.match(server,/setHeaders:\(res,filename\)=>res\.set\('Cache-Control',publicStaticCacheControl\(filename\)\)/);
});
test('embedded training register skips duplicate navigation and measures intrinsic body height',()=>{
 const nav=read('public/bpd-navigation.js'),resizer=read('public/training-register-embed.js');
 assert.match(nav,/here==='\/rollen-opleidingen\.html'/);
 assert.match(nav,/window\.parent!==window\)return;/);
 assert.match(resizer,/const raw=document\.body\?\.scrollHeight\|\|0/);
 assert.doesNotMatch(resizer,/Math\.max\(document\.documentElement\?\.scrollHeight/);
});
