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

test('police rank and cadre representation remain independent of the coat',()=>{
 const ui=load(true);
 const cases=[['900','1hcp','gold-thick'],['910','1cp','gold-thick'],
  ['920','acp','gold-none'],['930','acp','gold-none'],['700','hinp','silver-none'],
  ['600','ahinp','silver-none'],['400','inp','silver-none'],['200','ap','silver-none']];
 for(const [call,grade,trim] of cases){
  const person={dept:'politie',call,name:'RX',awards:[]};
  assert.equal(ui.gradeFor(person).key,grade);
  const view=ui.makePortrait(person);
  assert.equal(view.dataset.trim,trim);
  const patch=view.children[0].children.find(x=>x.className.includes('cloth-rank'));
  assert.equal(patch.children[0].src,
   '/assets/bpd-rank-'+grade+'-clean-20261027.webp');
 }
});
test('awards are only in the actual recipient portrait, not conferred by rank template',()=>{
 const ui=load(true);
 const a={kind:'medal',id:'ereteken_rood',priority:10,color:'red',label:'Ereteken'};
 const yes=ui.makePortrait({dept:'politie',call:'900',name:'RX',awards:[a]});
 const no=ui.makePortrait({dept:'politie',call:'900',name:'RX',awards:[]});
 assert.ok(yes.children[0].children.some(x=>x.className==='bpd-uniform-medals'));
 assert.ok(!no.children[0].children.some(x=>x.className==='bpd-uniform-medals'));
});
