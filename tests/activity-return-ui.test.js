import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function compileInlineModule(path){
 const html=read(path);
 const match=html.match(/<script type="module">([\s\S]*?)<\/script>/i);
 assert.ok(match,'Inline module script not found in '+path);
 // The static first import is supplied by the browser; syntax-check the
 // remaining JavaScript without executing Firebase, DOM or network requests.
 const body=match[1].replace(/^import\s+.*?;\s*$/m,'');
 assert.doesNotThrow(()=>new Function(body),path+' contains invalid JavaScript');
}
test('activity center has valid JavaScript and actual verified/leave/ping columns',()=>{
 compileInlineModule('public/activiteitscentrum.html');
 const html=read('public/activiteitscentrum.html');
 for(const term of ['sourceNote','statistics','returnPanel','CHECKING','pingDossier',
   'loadReturnChecks','Goedgekeurd verlof']){
  assert.ok(html.includes(term),'Missing '+term);
 }
});
test('notification page has valid JavaScript and per-user return controls',()=>{
 compileInlineModule('public/meldingen.html');
 const html=read('public/meldingen.html');
 for(const term of ['leaveReturnPanel','leaveReturnUnread','loadLeaveReturnChecks',
   'return/checks','Gelezen','ACTIEF','50/50']){
  assert.ok(html.includes(term),'Missing '+term);
 }
});
test('shared menu indicator is syntax-valid and derived from authenticated unread API',()=>{
 const js=read('public/bpd-navigation.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.ok(js.includes("'/api/activity-return/checks'"));
 assert.ok(js.includes('bpd-action-warning'));
 assert.ok(!js.includes('localStorage.setItem(\'bpdUnread'));
});
