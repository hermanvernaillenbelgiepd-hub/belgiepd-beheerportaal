import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
class FakeElement{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};
 this.className='';this.src='';this.textContent='';this.style={setProperty(){}};
 this.classList={add:s=>{this.className+=' '+s}};this.complete=false}
 append(...list){this.children.push(...list)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
const load=(withCoat=true)=>{
 const env={window:{BPDUniformAssignments:{forPerson:()=>({
  uniformUrl:withCoat?'/api/role-artwork/file/uniform_politie_new_coat?v=123':'',
  rankUrl:'',visualLayout:null})}},document:{
  createElement:t=>new FakeElement(t),
  createElementNS:(_ns,t)=>new FakeElement(t)
 }};
 for(const filename of ['organogram-decorations.js','organogram-police-formal.js'])
  runInNewContext(readFileSync(new URL('../public/assets/'+filename,import.meta.url),'utf8'),env);
 return env.window.BPDPoliceUniform;
};
const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');

test('classic woven nameplate has diagonal side-stitches, separator, and gold/silver metal',()=>{
 assert.match(css,/repeating-linear-gradient\(129deg/);
 assert.match(css,/bpd-nameplate-metal-gold/);
 assert.match(css,/bpd-nameplate-metal-silver/);
 assert.match(css,/background:var\(--thread\)/);
});
test('gold and silver plate text follows actual grade and call',()=>{
 const ui=load();
 for(const [call,color] of [['900','gold'],['910','gold'],['920','gold'],
  ['930','gold'],['700','silver'],['400','silver']]){
  const view=ui.makePortrait({dept:'politie',name:'RX',call,awards:[]});
  const plate=view.children[0].children.find(x=>x.className.includes('nameplate'));
  assert.ok(plate,call);
  assert.match(plate.className,new RegExp('metal-'+color),call);
  assert.equal(plate.children[0].textContent,'RX');
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+call);
 }
});
test('old static nameplate WebP may remain archived but no coat image is loaded without atelier composition',()=>{
 const view=load(false).makePortrait({dept:'politie',call:'900',name:'RX'});
 assert.match(view.className,/bpd-uniform-missing/);
 assert.equal(view.children[0].textContent,'Geen nieuw uniform ingesteld');
});
