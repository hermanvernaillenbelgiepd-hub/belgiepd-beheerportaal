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

test('all lower cadres use silver lettering on a saved, newly uploaded uniform',()=>{
 const ui=load(true);
 for(const call of ['100','200','300','400','500','600','700','800']){
  const view=ui.makePortrait({dept:'politie',call,name:'Nieuwe Naam',awards:[]});
  assert.equal(view.dataset.uniform,'silver');
  assert.equal(view.children[0].children[0].src,
   '/api/role-artwork/file/uniform_politie_new_coat?v=123');
  const name=view.children[0].children.find(x=>x.className.includes('nameplate'));
  assert.match(name.className,/bpd-nameplate-metal-silver/);
  assert.equal(name.children[0].textContent,'NIEUWE NAAM');
 }
});
test('rank badges still follow promotions regardless of coat illustration',()=>{
 const ui=load(true);
 const cases=[['200','ap'],['300','ainp'],['400','inp'],['500','1inp'],
  ['600','ahinp'],['700','hinp'],['800','1hinp'],['920','acp'],['900','1hcp']];
 for(const [call,key] of cases){
  const v=ui.makePortrait({dept:'politie',call,name:'Voorbeeld',awards:[]});
  const rank=v.children[0].children.find(x=>x.className.includes('cloth-rank'));
  assert.equal(rank.dataset.grade,key);
  assert.equal(rank.children[0].src,'/assets/bpd-rank-'+key+'-clean-20261027.webp');
 }
});
test('personally granted medals and ribbons still appear as separate layers on uploaded uniforms',()=>{
 const ui=load(true);
 const awards=[{kind:'ribbon',id:'lint_blauw_goud',priority:20,color:'blue-gold',label:'Lint'},
  {kind:'medal',id:'ereteken_zilver',priority:30,color:'silver',label:'Medaille'}];
 const portrait=ui.makePortrait({dept:'politie',call:'900',name:'Voorbeeld',awards});
 const stage=portrait.children[0];
 assert.ok(stage.children.some(x=>x.className==='bpd-uniform-ribbons'));
 assert.ok(stage.children.some(x=>x.className==='bpd-uniform-medals'));
});
