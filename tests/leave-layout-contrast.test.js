import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/verlofbeheer.html',import.meta.url),'utf8');

test('leave page defines scoped, contrasting dark and light summary tiles',()=>{
  assert.match(html,/<body class="bpd-leave-page">/);
  assert.match(html,/html\[data-bpd-theme="dark"\] body\.bpd-leave-page/);
  assert.match(html,/html:not\(\[data-bpd-theme="dark"\]\) body\.bpd-leave-page/);
  assert.match(html,/body\.bpd-leave-page #content>\.stat>div\{/);
  assert.match(html,/background:var\(--leave-surface\)!important;color:var\(--leave-heading\)!important/);
  assert.match(html,/body\.bpd-leave-page #content>\.stat small\{/);
});

test('leave page keeps one two-column work area with mobile fallback',()=>{
  assert.match(html,/class="grid leave-workspace"/);
  assert.match(html,/id="leaveRequestPanel"/);
  assert.match(html,/id="leaveHistoryPanel"/);
  assert.match(html,/@media\(max-width:880px\)/);
  assert.match(html,/@media\(max-width:640px\)/);
});

test('leave UI keeps request history, portal login and all data element IDs',()=>{
  for(const id of ['requestForm','start','end','note','dayCount','submitRequest',
    'countMine','myRole','myRequests','managementLink','feedback','authRequired']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/request\('\/api\/leave\/requests'\)/);
  assert.match(html,/setupPortalLogin\(/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'no duplicate IDs');
});

test('leave page JS is still valid and CSS brackets balanced',()=>{
  const js=/<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(js);
  assert.doesNotThrow(()=>new Function(js));
  const css=/<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
  assert.ok(css);
  let depth=0;
  for(const chr of css){if(chr==='{')depth++;else if(chr==='}')depth--;assert.ok(depth>=0);}
  assert.equal(depth,0);
});
