import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const start=html.indexOf('function makeServiceUniformPortrait(person){');
const end=html.indexOf('function openPersonProfile(p){',start);
assert.ok(start>=0&&end>start);
const functionCode=html.slice(start,end);
class El {
 constructor(tag,className='',text=''){
  this.tag=tag;this.className=className;this.textContent=text;
  this.children=[];this.attrs={};this.style={};
  this.naturalWidth=0;this.naturalHeight=0;
 }
 setAttribute(k,v){this.attrs[k]=v}
 append(...xs){this.children.push(...xs)}
 addEventListener(){}
}
function render(person,{professionAsset=false}={}){
 const chosen={uniformUrl:'/api/role-artwork/file/uniform_ambulance_default?v=1',
  profession:'dirmed',rankUrl:'/api/role-artwork/file/rank_ambulance_dir_med?v=1'};
 const win={
  BPDUniformAssignments:{forPerson:()=>chosen},
  BPDVisualAssets:{
   baseIcon:()=>'/assets/ambulance.svg',
   appendTo:(stage)=>{
    if(professionAsset)stage.append(new El('img','bpd-custom-uniform-layer','uploaded profession badge'));
   }
  }
 };
 const api=runInNewContext(functionCode+'\nmakeServiceUniformPortrait',{
  window:win,el:(...args)=>new El(...args),
  serviceRankKey:rank=>String(rank||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'),
  serviceCoatLayouts:new Map(),serviceRankArtworks:new Map(),
  serviceUniformLayouts:new Map(),serviceNameplateLayouts:new Map(),
  serviceVisibilityLayouts:new Map()
 });
 return api(person);
}
const flatten=node=>[node,...node.children.flatMap(flatten)];
test('synthetic DIRMED text label is absent from the AZLS coat',()=>{
 const portrait=render({dept:'ambulance',call:'DIRMED',rank:'Directeur',name:'Labo'});
 const nodes=flatten(portrait);
 assert.ok(nodes.some(n=>n.className==='bpd-service-coat'));
 assert.ok(nodes.some(n=>n.className==='bpd-service-grade'));
 assert.ok(nodes.some(n=>n.className==='bpd-service-nameplate'));
 assert.ok(!nodes.some(n=>n.className==='bpd-service-profession-text'));
 assert.ok(!nodes.some(n=>n.textContent==='DIRMED'));
});
test('uploadable profession artwork is not removed with the fallback text',()=>{
 const portrait=render({dept:'ambulance',call:'DIRMED',rank:'Directeur',name:'Labo'},
  {professionAsset:true});
 const nodes=flatten(portrait);
 assert.ok(nodes.some(n=>n.className==='bpd-custom-uniform-layer'));
 assert.ok(!nodes.some(n=>n.className==='bpd-service-profession-text'));
});
test('obsolete DIRMED dark text bar styles are absent from compact and full profile',()=>{
 assert.doesNotMatch(html,/bpd-service-profession-text/);
 assert.doesNotMatch(functionCode,/Medische functie: DIRMED/);
});
