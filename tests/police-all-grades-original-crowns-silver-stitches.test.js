import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
class Node {
 constructor(tag){
  this.tag=tag;this.children=[];this.className='';this.dataset={};
  this.attrs={};this.textContent='';this.style={setProperty(){}};
  this.classList={add:s=>{this.className+=' '+s}};
 }
 append(...xs){this.children.push(...xs)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
const window={BPDUniformAssignments:{forPerson:()=>({
 uniformUrl:'/api/role-artwork/file/uniform_politie_current?v=123',rankUrl:'',visualLayout:null})}};
runInNewContext(read('assets/organogram-police-formal.js'),{window,
 document:{createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t)}});
test('all 12 police call series use one unaltered rank art, unchanged crowns and silver lines',()=>{
 for(const [call,key,metal] of [
  ['100','ap','silver'],['200','ap','silver'],['300','ainp','silver'],
  ['400','inp','silver'],['500','1inp','silver'],['600','ahinp','silver'],
  ['700','hinp','silver'],['800','1hinp','silver'],
  ['900','1hcp','gold'],['910','1cp','gold'],
  ['920','acp','gold'],['930','acp','gold']]){
  const person={dept:'politie',call,name:'Voorbeeld',awards:[]};
  const portrait=window.BPDPoliceUniform.makePortrait(person);
  const badge=window.BPDPoliceUniform.makeBadge(person);
  const rank=portrait.children[0].children.find(x=>x.className.includes('cloth-rank'));
  assert.ok(rank,call);
  assert.equal(rank.dataset.grade,key,call);
  assert.equal(rank.children.length,1,call);
  assert.equal(rank.children[0].src,'/assets/bpd-rank-'+key+'-clean-20261027.webp',call);
  assert.match(badge.className,new RegExp('bpd-grade-metal-'+metal),call);
 }
});
test('gold crowns retain their image colors and rank/name diagonal embroidery is always silver',()=>{
 const css=read('assets/organogram-police-formal.css');
 const studio=read('gebruikersbeheer.html');
 for(const source of [css,studio]){
  assert.doesNotMatch(source,/background-color:#ffd044/);
  assert.doesNotMatch(source,/background:#ffd24b/);
  assert.match(source,/content:none!important;display:none!important/);
  assert.match(source,/#e0e7ef/);
 }
 assert.match(css,/object-fit:contain!important/);
 assert.match(studio,/compose-rank-metal-gold::after,[\s\S]*?content:none!important/);
 assert.match(css,/bpd-grade-metal-gold::after,[\s\S]*?content:none!important/);
});
