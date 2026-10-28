import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
class Node {
 constructor(tag){
  this.tag=tag;this.className='';this.children=[];this.dataset={};this.attrs={};
  this.textContent='';this.style={};this._src='';
  this.classList={add:k=>{this.className+=(this.className?' ':'')+k}};
 }
 set src(v){this._src=v}
 get src(){return this._src}
 setAttribute(k,v){this.attrs[k]=v}
 append(...a){this.children.push(...a)}
}
function mockScope(useCanvas=false){
 const state={rasterizations:0,px:null};
 const doc={
  createElement(tag){
   if(tag==='canvas'){
    return {width:0,height:0,getContext(){
     return {drawImage(){},getImageData(){
      return {data:Uint8ClampedArray.from([
       28,56,96,255, 225,185,69,255, 1,33,74,255
      ])};
     },putImageData(image){
      state.px=Array.from(image.data);state.rasterizations++;
     }};
    },toDataURL(){return 'data:image/webp;base64,TEST_UNIFIED_NAVY'}};
   }
   return new Node(tag);
  },
  createElementNS(_ns,tag){return new Node(tag);}
 };
 const scope={window:{},document:doc};
 if(useCanvas){
  scope.Image=class {
   constructor(){this.naturalWidth=3;this.naturalHeight=1}
   set src(value){this._src=value;queueMicrotask(()=>this.onload?.())}
   get src(){return this._src}
  };
 }
 runInNewContext(src,scope,{filename:'organogram-police-formal.js'});
 return {app:scope.window.BPDPoliceUniform,state};
}
test('the same native photo source is used by officer and corps instead of different SVG pictures',()=>{
 const {app}=mockScope();
 for(const [call,trim] of [['920','gold-none'],['930','gold-none'],['900','gold-thick'],['910','gold-thick']]){
  const portrait=app.makePortrait({dept:'politie',call,name:'Jones',awards:[]});
  assert.equal(portrait.dataset.trim,trim);
  assert.equal(portrait.children[0].children[0].src,app.asset);
 }
 assert.doesNotMatch(src,/OFFICER_NAVY_BASE/);
 assert.match(src,/function matchedGoldNavy\(\)/);
 assert.match(html,/unified-gold-navy-frame-20261028/);
});
test('shared canvas processor produces the same corrected blue for both gold cadres, preserves gold',async()=>{
 const {app,state}=mockScope(true);
 const officer=app.makePortrait({dept:'politie',call:'920',name:'Jones'});
 const corps=app.makePortrait({dept:'politie',call:'900',name:'Jones'});
 for(let i=0;i<6;i++)await Promise.resolve();
 assert.equal(state.rasterizations,1,'the shared source should only be processed once');
 assert.deepEqual(state.px.slice(0,4),[1,33,74,255],'cloth RGB is corrected');
 assert.deepEqual(state.px.slice(4,8),[225,185,69,255],'gold stays untouched');
 assert.equal(officer.children[0].children[0].src,'data:image/webp;base64,TEST_UNIFIED_NAVY');
 assert.equal(corps.children[0].children[0].src,'data:image/webp;base64,TEST_UNIFIED_NAVY');
});
test('frame sizing, crop and coordinates are shared across gold and silver',()=>{
 const normalized=css.slice(css.indexOf('/* Gold and silver frames: fixed identical geometry'));
 assert.ok(normalized.startsWith('/* Gold and silver frames: fixed identical geometry'));
 for(const text of ['width:70px;min-width:70px;max-width:70px;height:66px',
  'width:156px;min-width:156px;max-width:156px;height:146px',
  'width:58px;min-width:58px;max-width:58px;height:55px',
  'width:128px;min-width:128px;max-width:128px;height:120px']){
  assert.ok(normalized.includes(text),text);
 }
 assert.match(normalized,/data-uniform="gold"\]>.bpd-gold-stage/);
 assert.match(normalized,/data-uniform="silver"\]>.bpd-silver-stage/);
 assert.match(normalized,/width:120%;height:auto;aspect-ratio:603\/469/);
 assert.match(css,/left:10\.25%;top:56\.2%;width:27\.75%/);
 assert.match(css,/left:62\.3%;top:56\.75%;\s*width:26\.6%;height:12\.25%/);
});
