import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {serviceProfileRank} from '../public/service-profile-presentation.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const between=(a,b)=>{
 const start=html.indexOf(a),end=html.indexOf(b,start);
 assert.ok(start>=0&&end>start,'missing '+a);
 return html.slice(start,end);
};
const helper=between('function makeAzlsCompactPortrait(person){','function person(p,compact=false,specialtyLabel=null){');
const cards=between('function person(p,compact=false,specialtyLabel=null){','function peopleList(rows,rankOnly=false,compact=false,specialtyLabel=null){');
class Node{
 constructor(tag,cls='',label=''){
  this.tag=tag;this.className=cls;this.textContent=label;
  this.children=[];this.attrs={};this.style={};this.title='';
  this.classList={add:x=>{this.className+=' '+x}};
 }
 append(...args){this.children.push(...args)}
 replaceChildren(...args){this.children=[...args]}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
 get childElementCount(){return this.children.length}
}
const el=(...args)=>new Node(...args);
function render(select=()=>({}),rankArts=new Map()){
 return runInNewContext(helper+'\n'+cards+'\n({makeAzlsCompactPortrait,person})',{
  el,window:{BPDUniformAssignments:{forPerson:select},
   BPDPoliceUniform:{makePortrait:p=>p.dept==='politie'?el('span','portrait bpd-police-formal'):null}},
  makeServiceUniformPortrait:()=>el('span','portrait bpd-service-uniform'),
  serviceRankKey:rank=>String(rank).toLowerCase().replace(/[^a-z0-9]+/g,'_'),
  serviceRankArtworks:rankArts,
  serviceUniformArtworks:new Map(),serviceProfileRank,
  openPersonProfile:()=>{},
  supportsSpecialtyInstructors:()=>false,
  isSpecialtyInstructor:()=>false
 });
}
test('AZLS personnel cards always include an accessible, honest portrait',()=>{
 const api=render();
 for(const p of [
  {dept:'ambulance',call:'AMB-01',rank:'Ambulancier',name:'Mathias2667'},
  {dept:'ambulance',call:'HARTS-01',rank:'Hoofd-Arts',name:'The_Lightning_Wizard'},
  {dept:'ambulance',call:'DIRMED',rank:'Directeur',name:'Labo'}]){
  const card=api.person(p);
  const icon=card.children.find(c=>c.className.includes('azls-compact-portrait'));
  assert.ok(icon,p.call);
  assert.match(icon.attrs['aria-label'],/Ambulancedienst/);
  assert.equal(icon.children[0].textContent,'✚');
  assert.equal(card.children.find(c=>c.className==='identity').children[0].textContent,p.name);
 }
});
test('real uploaded AZLS coats and ranks are shown without invented artwork',()=>{
 const p={dept:'ambulance',call:'VPK-01',rank:'Verpleegkundige',name:'Tester'};
 const coat=render(()=>({uniformUrl:'/api/role-artwork/file/uniform_ambulance_vpk?v=1'}));
 assert.ok(coat.person(p).children.some(c=>c.className.includes('bpd-service-uniform')));
 const rank=render(()=>({rankUrl:'/api/role-artwork/file/rank_ambulance_verpleegkundige?v=1'}));
 const mark=rank.person(p).children.find(c=>c.className.includes('azls-compact-portrait'));
 assert.equal(mark.children[0].src,'/api/role-artwork/file/rank_ambulance_verpleegkundige?v=1');
 assert.match(mark.attrs['aria-label'],/AZLS-gradenafbeelding/);
 const manifest=render(()=>({}),new Map([
  ['rank_ambulance_verpleegkundige','/api/role-artwork/file/rank_ambulance_verpleegkundige?v=2']
 ]));
 const fallback=manifest.person(p).children.find(c=>c.className.includes('azls-compact-portrait'));
 assert.equal(fallback.children[0].src,'/api/role-artwork/file/rank_ambulance_verpleegkundige?v=2');
});
test('specialization columns fill page and each member card fills its own column',()=>{
 assert.match(html,/grid-template-columns:repeat\(var\(--azls-specialty-count,5\),minmax\(0,1fr\)\)/);
 assert.match(html,/specs\.style\.setProperty\('--azls-specialty-count',String\(branchCount\)\)/);
 assert.match(html,/\.spec-list \.persons\.personnel-card-grid>\.person\{[\s\S]*?width:100%/);
 assert.match(html,/\.azls-compact-portrait\{[\s\S]*?width:48px!important/);
 assert.match(html,/@media \(max-width:1100px\)/);
 assert.match(html,/\.spec-list\.azls-specs-overflow/);
});
test('police and fire rendering is unchanged by the AZLS-specific enhancement',()=>{
 const api=render();
 assert.ok(api.person({dept:'politie',name:'Inspector',call:'400'}).children
  .some(c=>c.className.includes('bpd-police-formal')));
 assert.ok(api.person({dept:'brandweer',name:'Emiel',call:'OOFF-09'}).children
  .some(c=>c.className.includes('bpd-service-uniform')));
});
