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

test('both gold and silver variants use the uploaded coat and never old built-in photos',()=>{
 const ui=load(true);
 for(const call of ['900','920','700','400']){
  const view=ui.makePortrait({dept:'politie',call,name:'RX',awards:[]});
  assert.equal(view.children[0].children[0].src,
   '/api/role-artwork/file/uniform_politie_new_coat?v=123');
 }
});
test('scene zoom transforms the whole stage, so rank and name remain attached',()=>{
 assert.match(renderer,/stage\.style\.transform='translate\(-50%,-50%\) translate\('/);
 assert.match(renderer,/applyUniformCoatPlacement\(img,'gold',stage\)/);
 assert.match(renderer,/applyUniformCoatPlacement\(image,'silver',stage\)/);
 assert.match(css,/\.bpd-gold-stage>.bpd-personal-nameplate/);
 assert.match(css,/\.bpd-silver-stage>.bpd-personal-nameplate/);
});
