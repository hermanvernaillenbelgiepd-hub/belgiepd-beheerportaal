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

test('historical built-in gold/silver coats are no longer requested or rasterized',()=>{
 for(const call of ['900','920','700','300']){
  const view=load(false).makePortrait({dept:'politie',call,name:'Voorbeeld'});
  assert.match(view.className,/bpd-uniform-missing/);
  assert.ok(!view.children.some(x=>x.src));
 }
 assert.match(renderer,/if\(!coatUrl\)/);
 assert.doesNotMatch(renderer,/else setMatchedGoldCoat\(img\)/);
 assert.doesNotMatch(renderer,/else setMatchedSilverCoat\(image\)/);
});
test('officer/corps gold nameplate and lower cadres silver do not depend on the old coat',()=>{
 const ui=load(true);
 for(const [call,trim,color] of [['900','gold-thick','gold'],['910','gold-thick','gold'],
  ['920','gold-none','gold'],['930','gold-none','gold'],['800','silver-none','silver']]){
  const view=ui.makePortrait({dept:'politie',call,name:'RX',awards:[]});
  assert.equal(view.dataset.trim,trim);
  const plate=view.children[0].children.find(x=>x.className.includes('nameplate'));
  assert.match(plate.className,new RegExp('metal-'+color));
 }
});
