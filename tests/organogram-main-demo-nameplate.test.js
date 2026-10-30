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

test('nameplate vector follows live staff name and callsign',()=>{
 const ui=load(false);
 const p=ui.makeNameplate({dept:'politie',call:'900',name:'Thijs'},true);
 const svg=p.children[0];
 assert.equal(svg.tag,'svg');
 const labels=svg.children.filter(x=>x.tag==='text').map(x=>x.textContent);
 assert.deepEqual(labels,['Thijs','BELGIEPD - 900']);
 assert.match(p.className,/bpd-nameplate-metal-gold/);
});
test('traditional grade assets stay isolated from the retired coat bitmap',()=>{
 const ui=load(false);
 for(const [call,key] of [['300','ainp'],['400','inp'],['700','hinp'],
  ['920','acp'],['910','1cp'],['900','1hcp']]){
  const badge=ui.makeBadge({dept:'politie',call});
  assert.equal(badge.children[0].children[0].attrs.href,
   '/assets/bpd-rank-'+key+'-clean-20261027.webp');
 }
});
test('profiles without a new composition explicitly say no uniform instead of displaying historic coat',()=>{
 const p=load(false).makePortrait({dept:'politie',call:'900',name:'Thijs'});
 assert.match(p.className,/bpd-uniform-missing/);
 assert.equal(p.children[0].textContent,'Geen nieuw uniform ingesteld');
});
