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
test('slight color darkening targets only the officer coat, not its independent patches',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const scoped=css.slice(css.indexOf('/* Officers (920/930'));
 assert.ok(scoped.startsWith('/* Officers (920/930'),'scoped color change exists');
 assert.match(scoped,/\.portrait\.bpd-police-formal\[data-trim="gold-none"\]>\.bpd-gold-stage>\.bpd-gold-coat\s*\{/);
 assert.match(scoped,/filter:url\(#bpd-officer-navy-match\)/);
 assert.doesNotMatch(scoped,/filter:brightness/);
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(html,/<filter id="bpd-officer-navy-match"/);
 assert.match(html,/result="bpdBlueMatte"/);
 assert.match(html,/result="bpdMatchedNavy"/);
 assert.match(html,/operator="in" result="bpdRecoloredBlue"/);
 assert.match(html,/operator="out" result="bpdUntouchedNonBlue"/);
 assert.match(html,/0 1 0 0 -0\.090/);
 assert.match(html,/0 0 1 0 -0\.090/);
 assert.doesNotMatch(scoped,/\.bpd-gold-stage\s*\{|\.bpd-gold-nameplate\s*\{|\.bpd-gold-cloth-rank\s*\{|\.bpd-silver-coat\s*\{/);
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(html,/navy-matched-officers-20261028/);
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
