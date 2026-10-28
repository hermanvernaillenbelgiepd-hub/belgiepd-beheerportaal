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
test('colour-matched officer coat is embedded as its own static SVG image',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const svg=readFileSync(new URL('../public/assets/bpd-officieren-marine-match-20261028.svg',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.match(svg,/data:image\/webp;base64,/);
 assert.match(svg,/<filter id="officer-navy"/);
 assert.match(svg,/result="navyOnly"/);
 assert.match(svg,/result="recolored"/);
 assert.match(svg,/result="nonBlue"/);
 assert.match(js,/OFFICER_NAVY_BASE/);
 assert.match(js,/trim==='gold-none'\?OFFICER_NAVY_BASE:GOLD_BASE/);
 assert.doesNotMatch(css,/filter:url\(#bpd-officer-navy-match\)/);
 assert.doesNotMatch(html,/id="bpd-officer-navy-match"/);
 assert.match(html,/navy-corrected-image-20261028/);
});
test('officers are gold-none, corps leaders gold-thick, and other cadres silver-none',()=>{
 const ui=app();
 for(const [call,trim] of [['920','gold-none'],['930','gold-none'],['900','gold-thick'],['910','gold-thick'],['800','silver-none'],['500','silver-none'],['200','silver-none']]){
  const person={dept:'politie',call,name:'Jones'};
  const portrait=ui.makePortrait(person);
  assert.equal(portrait.dataset.trim,trim,call);
  assert.equal(portrait.children[0].children[0].src,
   trim==='silver-none'?ui.silverAsset:trim==='gold-none'?'/assets/bpd-officieren-marine-match-20261028.svg':ui.asset,call);
 }
});
