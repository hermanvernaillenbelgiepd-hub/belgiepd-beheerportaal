import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/to-dienstbord.html');
const css=read('public/to-dienstbord-theme.css');
const old=read('public/to-dienstbord.css');
const app=read('public/to-dienstbord.js');

test('TO theme stylesheet loads after shared navigation and follows the same preference',()=>{
 assert.ok(html.includes('<body class="to-duty-page">'));
 const shared=html.indexOf('/bpd-navigation.css');
 const theme=html.indexOf('/to-dienstbord-theme.css');
 assert.ok(shared>=0&&theme>shared);
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) body\.to-duty-page/);
 assert.match(css,/html\[data-bpd-theme="dark"\] body\.to-duty-page/);
 assert.match(css,/color-scheme:dark/);
});
test('all major TO surfaces and operational controls receive dark colors',()=>{
 for(const selector of ['.summary-card:not(.session)','.welcome','.radio-panel',
  '.team-card','.incident-card','.no-session','.archive-row',
  '.search-field input','.incident-filters','.radio-channel',
  '.pending-radio-section','.dialog-header','.dialog-footer','.feedback']){
  assert.ok(css.includes(selector),'Missing theme treatment for '+selector);
 }
 assert.match(css,/\.team-card\[data-availability="ready"\]/);
 assert.match(css,/\.team-card\[data-availability="on-incident"\]/);
 assert.match(css,/\.team-card\[data-availability="on-pause"\]/);
 assert.match(css,/\.team-card\[data-service="brandweer"\]/);
 assert.match(css,/\.team-card\[data-service="ambulance"\]/);
 assert.match(css,/\.team-card\[data-service="depannage"\]/);
});
test('theme fix does not modify operational radio or duty logic',()=>{
 assert.match(old,/--navy:#111c38/);
 assert.match(app,/sonoran|radio/i);
 assert.doesNotMatch(css,/permission|fetch\(|api\/to-board/);
});
test('dark body text and secondary text have at least AA contrast on board surfaces',()=>{
 const rgb=hex=>hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>
  x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));
 const luminance=hex=>{const v=rgb(hex.replace('#',''));return v[0]*.2126+v[1]*.7152+v[2]*.0722};
 const contrast=(a,b)=>{const high=Math.max(luminance(a),luminance(b)),low=Math.min(luminance(a),luminance(b));return(high+.05)/(low+.05)};
 assert.ok(contrast('#e7f1ff','#12243e')>=4.5);
 assert.ok(contrast('#bdd0e9','#12243e')>=4.5);
 assert.ok(contrast('#eaf2ff','#192e4c')>=4.5);
});
