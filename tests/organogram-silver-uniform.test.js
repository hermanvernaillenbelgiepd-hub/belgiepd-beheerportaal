import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Node {
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.className='';this.src='';
  this.style={setProperty(k,v){this[k]=v}};
  this.classList={add:k=>{this.className+=(this.className?' ':'')+k}};
 }
 setAttribute(k,v){this.attrs[k]=v}
 append(...nodes){this.children.push(...nodes)}
}
function ui(){
 const scope={window:{},
  document:{createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag)}};
 for(const file of ['organogram-decorations.js','organogram-police-formal.js']){
  runInNewContext(readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8'),scope,{filename:file});
 }
 return scope.window.BPDPoliceUniform;
}
test('the chosen silver artwork is a genuine, local WebP asset',()=>{
 const p='/assets/bpd-uniform-zilver-dynamisch-20261028.webp';
 const b=readFileSync(new URL('../public'+p,import.meta.url));
 assert.equal(b.toString('ascii',0,4),'RIFF');
 assert.equal(b.toString('ascii',8,12),'WEBP');
 assert.ok(b.length>3000&&b.length<250000);
 assert.equal(ui().silverAsset,p);
});
test('cadres 100-899 use the silver coat immediately, without a golden flash',()=>{
 const system=ui();
 for(const call of ['101','200','300','400','500','600','700','800','899']){
  const p=system.makePortrait({dept:'politie',call,name:'Voorbeeld',awards:[]});
  assert.equal(p.dataset.uniform,'silver',call);
  assert.equal(p.dataset.trim,'silver-none',call);
  assert.equal(p.children[0].src,system.silverAsset,call);
  assert.equal(p.children.length,3);
 }
 for(const call of ['900','910','920','930']){
  const p=system.makePortrait({dept:'politie',call,name:'Voorbeeld',awards:[]});
  assert.equal(p.dataset.uniform,'gold',call);
  assert.equal(p.children[0].src,system.asset,call);
 }
});
test('promotion, demotion and name updates select the new uniform and real cloth plate',()=>{
 const system=ui();
 const examples=[
  ['200','ap','silver'],['400','inp','silver'],['500','1inp','silver'],
  ['600','ahinp','silver'],['700','hinp','silver'],['800','1hinp','silver'],
  ['900','1hcp','gold'],['910','1cp','gold'],['920','acp','gold'],
  ['700','hinp','silver'],['300','ainp','silver']
 ];
 for(const [call,grade,uniform] of examples){
  const person={dept:'politie',call,name:'Nieuwe Naam',awards:[]};
  const p=system.makePortrait(person);
  assert.equal(p.dataset.uniform,uniform,call);
  const plate=p.children.find(x=>x.className.includes('bpd-chest-insignia'));
  assert.equal(plate.children[0].children[0].attrs.href,
   '/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
  const name=p.children.find(x=>x.className==='bpd-personal-nameplate');
  const text=name.children[0].children.filter(x=>x.tag==='text').map(x=>x.textContent);
  assert.deepEqual(text,['Nieuwe Naam','BELGIEPD - '+call]);
 }
});
test('awards and medals remain independent of uniform choice',()=>{
 const system=ui();
 const awards=[
  {kind:'ribbon',id:'lint_blauw_goud',priority:10,color:'blue-gold',label:'Lint'},
  {kind:'medal',id:'ereteken_zilver',priority:30,color:'silver',label:'Ereteken'}
 ];
 for(const call of ['500','700','900']){
  const p=system.makePortrait({dept:'politie',call,name:'Test',awards});
  assert.ok(p.children.some(x=>x.className==='bpd-uniform-ribbons'),call);
  assert.ok(p.children.some(x=>x.className==='bpd-uniform-medals'),call);
 }
});
test('new coordinates are limited to silver uniforms, preserving existing gold artwork',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const decorationCss=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
 assert.match(css,/\[data-uniform="silver"\]>\.bpd-personal-nameplate/);
 assert.match(css,/\[data-uniform="silver"\]>\.bpd-chest-insignia/);
 assert.match(decorationCss,/\[data-uniform="silver"\]>\.bpd-uniform-ribbons/);
 assert.match(decorationCss,/\[data-uniform="silver"\]>\.bpd-uniform-medals/);
 assert.match(readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8'),/silver-uniform-20261028/);
});

test('silver jacket zoom matches golden card heights without moving plates independently',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const decorations=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
 const block=css.slice(css.indexOf('/* Silver uniform: same portrait/card dimensions'));
 assert.match(block,/\{width:67px;height:77px\}/);
 assert.match(block,/\{width:156px;height:170px\}/);
 assert.match(block,/\{width:57px;height:65px\}/);
 assert.match(block,/\{width:128px;height:139px\}/);
 assert.match(block,/transform:scale\(1\.42\);transform-origin:50% 0/);
 // Confirm overlays follow precisely the same zoom as the photo.
 const zoom=1.42;
 const round=n=>Number(n.toFixed(3));
 const x=n=>round(50+(n-50)*zoom);
 const y=n=>round(n*zoom);
 assert.equal(x(31.15),23.233);
 assert.equal(y(36.85),52.327);
 assert.equal(x(53.25),54.615);
 assert.equal(round(11.1*zoom),15.762);
 assert.equal(round(11.35*zoom),16.117);
 assert.match(block,/left:23\.233%;top:52\.327%;width:15\.762%;height:6\.461%/);
 assert.match(block,/left:54\.615%;top:52\.327%;width:16\.117%;height:6\.461%/);
 assert.match(decorations,/left:54\.828%;top:45\.724%;width:17\.324%;height:3\.976%/);
 assert.match(decorations,/left:54\.97%;top:65\.036%;width:22\.436%;height:22\.72%/);
 const page=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(page,/silver-uniform-zoom-20261028/);
});
