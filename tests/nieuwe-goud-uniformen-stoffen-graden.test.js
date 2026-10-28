import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../public/uniformen-nieuw-goud-proef.html',import.meta.url),'utf8');

class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.className='';this.dataset={};this.attrs={};
  this.src='';this.textContent='';
 }
 append(...nodes){this.children.push(...nodes)}
 setAttribute(key,val){this.attrs[key]=val}
}
function preview(){
 const script=page.match(/<script>\/\* Visual preview, no writes or personnel permissions; later reusable by the organogram\. \*\/([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'TEST visual-preview script exists');
 const win={};
 runInNewContext(script,{window:win,document:{createElement:tag=>new Element(tag)}});
 return win.BPDNewUniform;
}

test('TEST only: keep the approved gold coat and display correct original textile rank assets',()=>{
 assert.match(page,/Nieuwe gouden uniformen/);
 assert.match(page,/TEST – visuele proef/);
 assert.match(page,/bpd-new-coat/);
 assert.match(page,/De originele stoffen graadplaten komen uit lokale TEST-bestanden/);
 assert.doesNotMatch(page,/https:\/\/belgiepd-beheerportaal\.onrender\.com\/assets\/bpd-rank-/);
 assert.match(page,/\.bpd-new-rankplate>img\{width:100%;height:100%;object-fit:contain/);
 assert.doesNotMatch(page,/\.bpd-new-rankplate>img\{[^}]*object-fit:fill/);
});

test('all four gold cadre ranks switch to their corresponding actual embroidered plate',()=>{
 const u=preview();
 for(const [call,grade,label,cadre] of [
  ['900','1hcp','Eerste hoofdcommissaris','korpsleiding'],
  ['910','1cp','Eerste commissaris','korpsleiding'],
  ['920','acp','Aspirant-commissaris','officierenkader'],
  ['930','acp','Aspirant-commissaris','officierenkader']
 ]){
  const p=u.makePortrait({dept:'politie',call,name:'Bijgewerkte Naam',medal:true});
  assert.equal(p.dataset.cadre,cadre,call);
  const plate=p.children.find(x=>x.className==='bpd-new-rankplate');
  assert.ok(plate,call);
  assert.equal(plate.dataset.grade,grade,call);
  assert.equal(plate.children[0].src,'/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
  assert.equal(plate.children[0].alt,label,call);
  assert.match(plate.attrs['aria-label'],/geborduurde gradenplaat/i,call);
  const name=p.children.find(x=>x.className==='bpd-new-nameplate');
  assert.equal(name.children[0].textContent,'Bijgewerkte Naam',call);
  assert.equal(name.children[1].textContent,'BELGIEPD - '+call,call);
  assert.ok(p.children.some(x=>x.className==='bpd-new-awarded-medal'),call);
 }
 assert.equal(u.rankFor('900').key,'1hcp');
 assert.equal(u.rankFor('910').key,'1cp');
 assert.equal(u.rankFor('920').key,'acp');
 assert.equal(u.rankFor('930').key,'acp');
});

test('local cloth grades are exact isolated WebP images and contain no server writes',()=>{
 for(const grade of ['1hcp','1cp','acp','cp','ap','ainp','inp','1inp','ahinp','hinp','1hinp']){
  const bytes=readFileSync(new URL('../public/assets/bpd-rank-'+grade+'-clean-20261027.webp',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF',grade);
  assert.equal(bytes.toString('ascii',8,12),'WEBP',grade);
  assert.ok(bytes.byteLength>10000,grade);
 }
 const isolated=page.match(/<script>\/\* Visual preview, no writes or personnel permissions; later reusable by the organogram\. \*\/([\s\S]*?)<\/script>/)?.[1];
 assert.ok(isolated);
 assert.doesNotMatch(isolated,/(?:fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|\/api\/)/);
});
