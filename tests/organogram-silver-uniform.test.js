import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Node{
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};
  this.className='';this.src='';this.textContent='';
  this.style={setProperty(){}};
  this.classList={add:k=>{this.className+=(this.className?' ':'')+k}};
 }
 setAttribute(k,v){this.attrs[k]=v}
 append(...nodes){this.children.push(...nodes)}
}
function ui(){
 const env={window:{},document:{
  createElement:tag=>new Node(tag),
  createElementNS:(_ns,tag)=>new Node(tag)}};
 for(const filename of ['organogram-decorations.js','organogram-police-formal.js']){
  runInNewContext(readFileSync(new URL('../public/assets/'+filename,import.meta.url),'utf8'),env);
 }
 return env.window.BPDPoliceUniform;
}
function find(el,cls){return el.children.find(x=>x.className.includes(cls))}
const SILVER='/assets/bpd-uniform-zilver-zonder-koord-nieuw-20261028.webp';
const GOLD='/assets/bpd-gold-officer-corps-approved-20261028.webp';

test('approved cord-free TEST coat is copied byte-for-byte onto MAIN as a standalone WebP',()=>{
 const bytes=readFileSync(new URL('../public'+SILVER,import.meta.url));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.ok(bytes.byteLength>40000&&bytes.byteLength<100000);
 assert.equal(ui().silverAsset,SILVER);
});

test('all seven silver ranks automatically show their own original embroidered patch',()=>{
 const p=ui();
 for(const [call,grade] of [
  ['101','ap'],['200','ap'],['299','ap'],
  ['300','ainp'],['400','inp'],['500','1inp'],
  ['600','ahinp'],['700','hinp'],['800','1hinp'],['899','1hinp']
 ]){
  const person={dept:'politie',call,name:'Nieuwe Naam',awards:[]};
  const view=p.makePortrait(person,true);
  assert.equal(view.dataset.uniform,'silver',call);
  assert.equal(view.dataset.trim,'silver-none',call);
  assert.equal(view.children.length,1,call);
  const stage=view.children[0];
  assert.equal(stage.className,'bpd-silver-stage');
  assert.equal(stage.children[0].src,SILVER);
  assert.equal(stage.children.length,3,call);
  const name=find(stage,'bpd-silver-woven-nameplate');
  assert.equal(name.children[0].textContent,'NIEUWE NAAM');
  assert.equal(name.children[1].textContent,'BELGIEPD - '+call);
  const plate=find(stage,'bpd-silver-cloth-rank');
  assert.equal(plate.dataset.grade,grade);
  assert.equal(plate.children[0].src,'/assets/bpd-rank-'+grade+'-clean-20261027.webp');
  const badge=p.makeBadge(person);
  assert.equal(badge.children[0].children[0].attrs.href,
   '/assets/bpd-rank-'+grade+'-clean-20261027.webp');
 }
});

test('promotions and demotions retain dynamically separate gold and silver images',()=>{
 const p=ui();
 const chain=[
  ['700','hinp','silver',SILVER],
  ['920','acp','gold',GOLD],
  ['900','1hcp','gold',GOLD],
  ['600','ahinp','silver',SILVER],
  ['300','ainp','silver',SILVER]
 ];
 for(const [call,key,metal,asset] of chain){
  const v=p.makePortrait({dept:'politie',call,name:'Promotie Test'});
  assert.equal(v.dataset.uniform,metal);
  const stage=v.children[0];
  assert.equal(stage.children[0].src,asset);
  const grade=find(stage,'cloth-rank');
  assert.equal(grade.dataset.grade,key);
  assert.equal(grade.children[0].src,
   '/assets/bpd-rank-'+key+'-clean-20261027.webp');
  const woven=find(stage,'nameplate');
  assert.equal(woven.children[0].textContent,'PROMOTIE TEST');
  assert.equal(woven.children[1].textContent,'BELGIEPD - '+call);
 }
});

test('ribbons and medals are independent layers derived from existing awards',()=>{
 const p=ui();
 const awards=[
  {kind:'ribbon',id:'lint_blauw_goud',priority:10,color:'blue-gold',label:'Lint'},
  {kind:'medal',id:'ereteken_zilver',priority:30,color:'silver',label:'Ereteken'}
 ];
 for(const call of ['200','400','700','900','930']){
  const view=p.makePortrait({dept:'politie',name:'Test',call,awards});
  const stage=view.children[0];
  assert.ok(find(stage,'bpd-uniform-ribbons'),call);
  assert.ok(find(stage,'bpd-uniform-medals'),call);
  const noAwards=p.makePortrait({dept:'politie',name:'Test',call,awards:[]});
  assert.ok(!find(noAwards.children[0],'bpd-uniform-medals'),call);
 }
});

test('exact approved silver coordinates and woven texture, no obsolete separate zoom',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(css,/\.bpd-police-formal\[data-uniform="silver"\]>.bpd-silver-stage/);
 assert.match(css,/aspect-ratio:603\/469/);
 assert.match(css,/left:10\.25%;top:56\.2%;width:27\.75%/);
 assert.match(css,/left:62\.3%;top:56\.75%;[\s\n]*width:26\.6%;height:12\.25%/);
 assert.match(css,/bpd-naamplaat-geweven-leeg-20261028\.webp/);
 assert.match(css,/\.bpd-silver-cloth-rank>\.bpd-silver-grade-art/);
 assert.doesNotMatch(css,/transform:translateY\(-6%\) scale\(1\.68\)/);
 assert.match(css,/\.bpd-gold-stage/);
 assert.match(html,/soft-portrait-frames-20261028/);
});
