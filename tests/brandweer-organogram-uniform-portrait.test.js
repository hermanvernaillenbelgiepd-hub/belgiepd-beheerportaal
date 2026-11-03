import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {serviceProfileRank} from '../public/service-profile-presentation.js';
const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const slice=(from,to)=>{const start=page.indexOf(from),end=page.indexOf(to,start);assert.ok(start>=0&&end>start);return page.slice(start,end)};
const renderer=slice('function serviceRankKey(rank){','function openPersonProfile(p){');
const card=slice('function person(p,compact=false,specialtyLabel=null){','function peopleList(rows,rankOnly=false,compact=false,specialtyLabel=null){');
class El {
 constructor(tag,cls='',text=''){
  this.tag=tag;this.className=cls;this.textContent=text;this.children=[];
  this.attrs={};this.style={};this.title='';this.dataset={};this.loading='';
  this.classList={add:name=>{this.className+=' '+name;}};
 }
 append(...xs){this.children.push(...xs)}
 setAttribute(key,value){this.attrs[key]=value}
 addEventListener(){}
 get childElementCount(){return this.children.length}
}
const el=(tag,cls='',value='')=>new El(tag,cls,value);
const run=(code,other={})=>runInNewContext(code,{el,window:{
 BPDVisualAssets:{baseIcon:dept=>'/images/'+dept+'.svg'},
 BPDUniformAssignments:{forPerson:person=>({
  uniformUrl:person.dept==='brandweer'?'/api/role-artwork/file/uniform_brandweer_default?v=1':'',
  rankUrl:person.dept==='brandweer'?'/api/role-artwork/file/rank_brandweer_zonecommandant?v=1':'',
  visualLayout:null})},
 BPDPoliceUniform:{makePortrait:p=>p.dept==='politie'?el('span','portrait bpd-police-formal'):null}
},serviceCoatLayouts:new Map(),serviceNameplateLayouts:new Map(),serviceRankArtworks:new Map(),
 serviceUniformLayouts:new Map(),serviceUniformArtworks:new Map(),serviceVisibilityLayouts:new Map(),serviceProfileRank,...other});
test('roster uses the exact service portrait factory used in the expanded profile for brandweer',()=>{
 assert.match(page,/const portrait=p\.dept==='brandweer'\?makeServiceUniformPortrait\(p\):/);
 assert.match(page,/p\.dept==='ambulance'\?makeAzlsCompactPortrait\(p\):/);
 assert.match(page,/window\.BPDPoliceUniform\?\.makePortrait\?\.\(p,true\):makeServiceUniformPortrait\(portraitPerson\)/);
});
test('brandweer small card now shows the live nameplate and grade on the actual uniform',()=>{
 const p={dept:'brandweer',name:'Alex',call:'ZONE',rank:'Zonecommandant'};
 const fn=run(renderer+'\n'+card+'\n({makeServiceUniformPortrait,person})');
 const node=fn.person(p);
 const portrait=node.children.find(c=>c.className.includes('bpd-service-uniform'));
 assert.ok(portrait,'fire roster must contain the existing service uniform');
 const stage=portrait.children[0];
 const plate=stage.children.find(c=>c.className==='bpd-service-nameplate');
 assert.ok(plate,'fire roster uniform must include nameplate');
 assert.equal(plate.children[0].textContent,'ALEX');
 assert.equal(plate.children[1].textContent,'BRANDWEER · ZONE');
 const grade=stage.children.find(c=>c.className==='bpd-service-grade');
 assert.ok(grade);
 assert.equal(grade.children[0].src,'/api/role-artwork/file/rank_brandweer_zonecommandant?v=1');
});
test('other services retain their existing compact presentation',()=>{
 const api=run(renderer+'\n'+card+'\n({person})');
 const police=api.person({dept:'politie',name:'Test',call:'300',rank:'Aspirant Inspecteur'});
 assert.ok(police.children.some(x=>x.className.includes('bpd-police-formal')));
 const ambulance=api.person({dept:'ambulance',name:'Test',call:'AMB-01',rank:'AMB'});
 assert.ok(ambulance.children.some(x=>x.className.includes('azls-compact-portrait')));
 assert.ok(!ambulance.children.some(x=>x.className.includes('bpd-service-uniform')));
});
test('service uniform styles apply to the organogram thumbnail, not only the open dialog',()=>{
 assert.match(page,/#services \.person>\.portrait\.bpd-service-uniform/);
 assert.match(page,/#services \.person \.bpd-service-stage>\.bpd-service-nameplate/);
 assert.match(page,/#services \.person \.bpd-service-stage>\.bpd-service-grade/);
});
