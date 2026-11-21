import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('academy register stays protected and has same-origin responsive embedded height',()=>{
 const parent=read('public/opleidingscentrum.html'),child=read('public/rollen-opleidingen.html'),adapter=read('public/training-register-embed.js');
 assert.match(parent,/event\.origin!==location\.origin/);
 assert.match(parent,/event\.source!==frame\?\.contentWindow/);
 assert.match(parent,/bpd-training-register-resize/);
 assert.match(parent,/Number\.isSafeInteger\(height\)/);
 assert.match(child,/src="\/training-register-embed\.js"/);
 assert.match(adapter,/window\.parent\.postMessage\(\{type:'bpd-training-register-resize',height\},location\.origin\)/);
 assert.match(adapter,/ResizeObserver/);
 assert.doesNotMatch(adapter,/Authorization|discordId|Firebase|fetch\(/);
});
test('start screen has one account and roles card rather than duplicated admin links',()=>{
 const home=read('public/index.html');
 assert.doesNotMatch(home,/<h3>Beheertoegang hulpdiensten<\/h3>/);
 assert.match(home,/<h3>Gebruikersbeheer &amp; rechten<\/h3>/);
 assert.match(home,/id="adminNavLink" href="\/gebruikersbeheer\.html#dienstbeheer"/);
});
