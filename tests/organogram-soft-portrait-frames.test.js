import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
const after=css.slice(css.indexOf('/* Approved softer, nearly square uniform portraits'));
function assertFrame(width,height){
 const imageHeight=width*1.2/(603/469);
 assert.ok(Math.abs(height-imageHeight)<1,'portrait image must fill a '+width+'x'+height+' frame vertically');
 assert.ok(Math.abs(width-height)<=10,'compact portrait must be approximately square');
}
test('soft frames are near-square at all four supported sizes, without visible top/bottom letterbox',()=>{
 assert.ok(after.startsWith('/* Approved softer, nearly square uniform portraits'));
 for(const [w,h] of [[70,66],[156,146],[58,55],[128,120]]){
  assert.match(after,new RegExp('width:'+w+'px;height:'+h+'px'));
  assertFrame(w,h);
 }
 assert.match(after,/border-radius:15px/);
 assert.match(after,/border-radius:19px/);
 assert.match(after,/border:1px solid #486888/);
 assert.match(after,/box-shadow:inset 0 0 0 1px/);
 assert.match(after,/data-uniform="gold"\]>.bpd-gold-stage/);
 assert.match(after,/data-uniform="silver"\]>.bpd-silver-stage/);
 assert.match(after,/width:120%/);
 assert.doesNotMatch(after,/left:\s*\d+%;top:\s*\d+%;width:\s*\d+%;height:\s*\d+%;.*bpd-chest-insignia/);
});
test('rank plates and woven names are not changed by the new photo frame',()=>{
 const js=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.match(js,/bpd-uniform-zilver-zonder-koord-nieuw-20261028\.webp/);
 assert.match(js,/bpd-gold-officer-corps-approved-20261028\.webp/);
 assert.match(js,/function makeSilverWovenNameplate\(person\)/);
 assert.match(js,/function makeGoldNameplate\(person\)/);
 assert.match(js,/GRADE_ASSETS\[grade\?\.key\]/);
 assert.match(css,/left:10\.25%;top:56\.2%;width:27\.75%/);
 assert.match(css,/left:62\.3%;top:56\.75%;\s*width:26\.6%;height:12\.25%/);
 assert.match(html,/navy-corrected-image-20261028/);
});
test('visual frame applies without changes to data, awards or officer class',()=>{
 assert.match(after,/\.portrait\.bpd-police-formal\[data-uniform="gold"\]>.bpd-gold-stage/);
 assert.match(after,/\.portrait\.bpd-police-formal\[data-uniform="silver"\]>.bpd-silver-stage/);
 assert.match(css,/\.bpd-gold-stage>\.bpd-uniform-medals/);
 assert.match(css,/\.bpd-silver-stage>\.bpd-uniform-medals/);
 assert.doesNotMatch(after,/\bfetch\b|\/api\/|data-call|dataset\.grade/);
});
