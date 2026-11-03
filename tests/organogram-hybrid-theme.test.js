import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const css=read('organogram-hybrid.css');
const html=read('organogram-hierarchie.html');

test('organogram uses a page-specific hybrid stylesheet after the shared palette',()=>{
  assert.match(html, /<link rel="stylesheet" href="\/bpd-navigation\.css">\s*<link rel="stylesheet" href="\/organogram-hybrid\.css\?v=depannage-patch-20261103a">/);
});
test('hybrid organogram is light-only and keeps dark personnel cards readable',()=>{
  assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) #services \.service/);
  assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) #services \.person/);
  assert.match(css,/background:var\(--org-card\)!important/);
  assert.match(css,/\.person \.identity small/);
  assert.match(css,/var\(--org-card-subtitle\)!important/);
  assert.match(css,/\.level > summary\.level-title/);
  assert.match(css,/color:#e4f0ff!important/);
  assert.doesNotMatch(css,/(?:fetch|https:\/\/discord\.com\/api|firebase|localStorage|sessionStorage)/);
  assert.doesNotMatch(css,/html\[data-bpd-theme="dark"\]\s+(?:#services|\.service)/);
});
test('all five service identity accents and specializations are preserved',()=>{
  for(const dept of ['politie','brandweer','ambulance','depannage','burger']){
    assert.ok(css.includes('.service[data-dept="'+dept+'"]'));
  }
  assert.match(css,/\.police-specialty-grid > \.specialty/);
  assert.match(css,/\.police-instructors-panel/);
  assert.match(css,/\.police-teamleader-panel/);
  assert.doesNotMatch(css,/bpd-police-formal/);
});
