import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyPortalSecurityHeaders} from '../src/security-headers-policy.js';

function testHeaders(){
 const headers=new Map();
 applyPortalSecurityHeaders({set:(name,value)=>{headers.set(name,value)}});
 return headers;
}

test('global security headers protect against cross-origin framing without blocking same-origin iframes',()=>{
 const h=testHeaders();
 assert.equal(h.get('X-Frame-Options'),'SAMEORIGIN');
 assert.equal(h.get('Content-Security-Policy'),"frame-ancestors 'self'; base-uri 'self'");
 assert.equal(h.get('X-Content-Type-Options'),'nosniff');
 assert.equal(h.get('Referrer-Policy'),'no-referrer');
 assert.equal(h.get('Cache-Control'),'no-store');
});

test('first security phase does not unexpectedly block Discord, Firebase or existing inline scripts',()=>{
 const csp=testHeaders().get('Content-Security-Policy');
 assert.doesNotMatch(csp,/script-src|connect-src|default-src/);
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const middleware=server.indexOf('app.use((_req,res,next)=>{applyPortalSecurityHeaders(res);next();});');
 const staticServing=server.indexOf('app.use(express.static(');
 assert.ok(middleware>0,'security headers middleware must be installed');
 assert.ok(staticServing>middleware,'headers must precede public static files');
});
