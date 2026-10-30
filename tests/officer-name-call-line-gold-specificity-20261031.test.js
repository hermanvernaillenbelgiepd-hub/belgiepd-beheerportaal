import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('officer gold nameplate overrides the higher-specificity live default',()=>{
 const css=read('assets/organogram-police-formal.css');
 const block=css.match(/\.bpd-police-formal \.bpd-gold-stage>\.bpd-personal-nameplate\.bpd-woven-nameplate\.bpd-nameplate-metal-gold,[\s\S]*?--thread:(#[A-Fa-f0-9]{6});\s*--line-thread:(#[A-Fa-f0-9]{6});/);
 assert.ok(block,'the officer gold declaration must match or exceed the general stage selector specificity');
 assert.deepEqual(block.slice(1),['#ffd65a','#ffd65a']);
 assert.match(css,/\.bpd-police-formal \.bpd-gold-stage>\.bpd-personal-nameplate\.bpd-woven-nameplate\.bpd-nameplate-metal-silver/);
 assert.match(css,/--line-thread:#e0e7ef/);
 assert.match(css,/color:var\(--thread\)!important/);
 assert.match(css,/background:var\(--line-thread,#e0e7ef\)/);
 assert.doesNotMatch(css,/background:#ffd24b/);
});
test('Uniformatelier uses gold name, line and call, without recoloring diagonals',()=>{
 const html=read('gebruikersbeheer.html');
 assert.match(html,/\.compose-layer \.compose-nameplate\.compose-woven-nameplate\.compose-metal-gold\{--plate-thread:#ffd65a;--plate-line-thread:#ffd65a\}/);
 assert.match(html,/\.compose-layer \.compose-nameplate\.compose-woven-nameplate\.compose-metal-silver\{--plate-thread:#e0e7ef;--plate-line-thread:#e0e7ef\}/);
 assert.match(html,/color:var\(--plate-thread\)!important/);
 assert.match(html,/background:var\(--plate-line-thread,#e0e7ef\)/);
 assert.doesNotMatch(html,/background:#ffd24b/);
});
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.className='';this.dataset={};
  this.attrs={};this.textContent='';this.style={setProperty(){}};
  this.classList={add:s=>{this.className+=' '+s}}}
 append(...xs){this.children.push(...xs)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
function view(){
 const window={BPDUniformAssignments:{forPerson:()=>({
  uniformUrl:'/api/role-artwork/file/uniform_politie_test?v=1',rankUrl:'',visualLayout:null})}};
 runInNewContext(read('assets/organogram-police-formal.js'),{
  window,document:{createElement:t=>new Node(t),createElementNS:(_ns,t)=>new Node(t)}});
 return window.BPDPoliceUniform;
}
test('officer classifications receive gold writing; inspector classifications silver',()=>{
 const ui=view();
 for(const [call,rank,metal] of [
  ['920','ACP','gold'],['930','CP','gold'],['910','1CP','gold'],
  ['','AHCP','gold'],['','HCP','gold'],['900','1HCP','gold'],
  ['600','AHINP','silver'],['700','HINP','silver'],['800','1HINP','silver'],
  ['400','INP','silver']]){
  const person={dept:'politie',call,name:'THIJS',rank};
  const p=ui.makePortrait(person);
  const plate=p.children[0].children.find(x=>x.className.includes('bpd-woven-nameplate'));
  assert.match(plate.className,new RegExp('bpd-nameplate-metal-'+metal),rank);
  assert.equal(plate.children[0].textContent,'THIJS');
 }
});
