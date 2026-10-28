import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class El{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.className='';this.src='';this.textContent='';this.style={setProperty(){}};this.classList={add(k){this.className+=' '+k}}}
 append(...nodes){this.children.push(...nodes)}
 setAttribute(k,v){this.attrs[k]=v}
}
function app(){
 const scope={window:{},document:{createElement:t=>new El(t),createElementNS:(_ns,t)=>new El(t)}};
 for(const file of ['organogram-decorations.js','organogram-police-formal.js']){
  runInNewContext(readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8'),scope);
 }
 return scope.window.BPDPoliceUniform;
}
test('one shared gold coat is rasterised into navy pixels for officers and corps',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.match(js,/function matchedGoldNavy\(\)/);
 assert.match(js,/canvas\.getContext\('2d'/);
 assert.match(js,/ctx\.putImageData\(pixels,0,0\)/);
 assert.match(js,/toDataURL\('image\/webp',\.9\)/);
 assert.match(js,/setMatchedGoldCoat\(img\)/);
 assert.doesNotMatch(js,/OFFICER_NAVY_BASE/);
 assert.doesNotMatch(js,/bpd-officieren-marine-match-20261028\.svg/);
 assert.doesNotMatch(css,/filter:url\(#bpd-officer-navy-match\)/);
 assert.match(html,/unified-gold-navy-frame-20261028/);
 assert.match(css,/Gold and silver frames: fixed identical geometry/);
});
test('officers are gold-none, corps leaders gold-thick, and other cadres silver-none',()=>{
 const ui=app();
 for(const [call,trim] of [['920','gold-none'],['930','gold-none'],['900','gold-thick'],['910','gold-thick'],['800','silver-none'],['500','silver-none'],['200','silver-none']]){
  const person={dept:'politie',call,name:'Jones'};
  const portrait=ui.makePortrait(person);
  assert.equal(portrait.dataset.trim,trim,call);
  assert.equal(portrait.children[0].children[0].src,
   trim==='silver-none'?ui.silverAsset:ui.asset,call);
 }
});
