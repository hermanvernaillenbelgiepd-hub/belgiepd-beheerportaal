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
 const p='/assets/bpd-uniform-zilver-hd-20261028.webp';
 const b=readFileSync(new URL('../public'+p,import.meta.url));
 assert.equal(b.toString('ascii',0,4),'RIFF');
 assert.equal(b.toString('ascii',8,12),'WEBP');
 assert.ok(b.length>8000&&b.length<250000);
 assert.equal(b.toString('ascii',12,16),'VP8 ');
 const w=b.readUInt16LE(26)&0x3fff,h=b.readUInt16LE(28)&0x3fff;
 assert.ok(w>=400&&h>=390,'Never ship a 200x188 preview again');
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
  assert.equal(p.children[0].className,'bpd-gold-stage',call);
  assert.equal(p.children[0].children[0].src,system.asset,call);
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
  const gold=uniform==='gold',holder=gold?p.children[0]:p;
  const plate=holder.children.find(x=>x.className.includes('bpd-chest-insignia'));
  assert.ok(plate,call);
  if(gold){
   assert.equal(plate.dataset.grade,grade,call);
   assert.equal(plate.children[0].src,'/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
  }else{
   assert.equal(plate.children[0].children[0].attrs.href,
    '/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
  }
  const name=holder.children.find(x=>x.className.includes('bpd-personal-nameplate'));
  assert.ok(name,call);
  if(gold){
   assert.equal(name.children[0].textContent,'NIEUWE NAAM',call);
   assert.equal(name.children[1].textContent,'BELGIEPD - '+call,call);
  }else{
   const labels=name.children[0].children.filter(x=>x.tag==='text').map(x=>x.textContent);
   assert.deepEqual(labels,['Nieuwe Naam','BELGIEPD - '+call]);
  }
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
  const holder=p.dataset.uniform==='gold'?p.children[0]:p;
  assert.ok(holder.children.some(x=>x.className==='bpd-uniform-ribbons'),call);
  assert.ok(holder.children.some(x=>x.className==='bpd-uniform-medals'),call);
 }
});
test('new coordinates are limited to silver uniforms, preserving existing gold artwork',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const decorationCss=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
 assert.match(css,/\[data-uniform="silver"\]>\.bpd-personal-nameplate/);
 assert.match(css,/\[data-uniform="silver"\]>\.bpd-chest-insignia/);
 assert.match(decorationCss,/\[data-uniform="silver"\]>\.bpd-uniform-ribbons/);
 assert.match(decorationCss,/\[data-uniform="silver"\]>\.bpd-uniform-medals/);
 assert.match(readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8'),/woven-nameplate-main-20261028/);
});

test('silver jacket zoom matches golden card heights without moving plates independently',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const decorations=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
 const block=css.slice(css.indexOf('/* Silver uniform: same portrait/card dimensions'));
 assert.match(block,/\{width:67px;height:77px\}/);
 assert.match(block,/\{width:156px;height:170px\}/);
 assert.match(block,/\{width:57px;height:65px\}/);
 assert.match(block,/\{width:128px;height:139px\}/);
 assert.match(block,/transform:translateY\(-6%\) scale\(1\.68\);transform-origin:50% 0/);
 // Confirm overlays follow precisely the same zoom as the photo.
 const zoom=1.68;
 const verticalOffset=-6;
 const round=n=>Number(n.toFixed(3));
 const x=n=>round(50+(n-50)*zoom);
 const y=n=>round(n*zoom+verticalOffset);
 assert.equal(x(31.15),18.332);
 assert.equal(y(36.85),55.908);
 assert.equal(x(53.25),55.46);
 assert.equal(round(11.1*zoom),18.648);
 assert.equal(round(11.35*zoom),19.068);
 assert.match(block,/left:18.332%;top:56.25%;width:18.648%;height:6.444%/);
 assert.match(block,/left:55.46%;top:55.65%;width:19.068%;height:7.644%/);
 assert.match(decorations,/left:55.712%;top:48.096%;width:20.496%;height:4.704%/);
 assert.match(decorations,/left:55.88%;top:70.944%;width:26.544%;height:26.88%/);
 const page=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(page,/woven-nameplate-main-20261028/);
});

test('silver rank panel is higher and nameplate shorter, with centred insets',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const silver=css.slice(css.indexOf('/* Silver uniform: same portrait/card dimensions'));
 const extract=(key)=>{
  const start=silver.indexOf('.bpd-police-formal[data-uniform="silver"]>'+key+'{');
  assert.ok(start>=0,key);
  const block=silver.slice(start,silver.indexOf('}',start));
  const match=block.match(/left:([0-9.]+)%;top:([0-9.]+)%;width:([0-9.]+)%;height:([0-9.]+)%/);
  assert.ok(match,key);
  return match.slice(1).map(Number);
 };
 const name=extract('.bpd-personal-nameplate'),rank=extract('.bpd-chest-insignia');
 assert.equal(name[0],18.332);
 assert.equal(rank[0],55.46);
 assert.equal(rank[1],55.65);
 assert.ok(name[3]<rank[3]);
 assert.ok(Math.abs((name[1]+name[3]/2)-(rank[1]+rank[3]/2))<.001);
 assert.equal(name[2],18.648);
 assert.equal(rank[2],19.068);
});
