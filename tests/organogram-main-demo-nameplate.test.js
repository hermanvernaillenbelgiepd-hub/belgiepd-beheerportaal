import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Element {
 constructor(tag) {
  this.tag=tag;this.className='';this.children=[];this.attrs={};
  this.dataset={};this.style={setProperty(k,v){this[k]=v}};
  this.classList={add(x){this.className+=(this.className?' ':'')+x}};
  this.textContent='';this.src='';this.title='';
 }
 append(...elements){this.children.push(...elements)}
 setAttribute(k,v){this.attrs[k]=String(v)}
}
function uniform(){
 const env={window:{},document:{
  createElement:tag=>new Element(tag),
  createElementNS:(_ns,tag)=>new Element(tag)
 }};
 const js=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 runInNewContext(js,env,{filename:'organogram-police-formal.js'});
 return env.window.BPDPoliceUniform;
}
test('MAIN uniform: name above a silver line, BELGIEPD and callsign below, no nested name box',()=>{
 const ui=uniform();
 const person={dept:'politie',name:'Thijs',call:'900'};
 const plate=ui.makeNameplate(person,true);
 assert.match(plate.className,/bpd-personal-nameplate/);
 assert.match(plate.className,/bpd-nameplate-zoom/);
 const art=plate.children[0];
 assert.equal(art.tag,'svg');
 assert.equal(art.attrs.viewBox,'0 0 320 100');
 const labels=art.children.filter(x=>x.tag==='text').map(x=>x.textContent);
 assert.deepEqual(labels,['Thijs','BELGIEPD - 900']);
 assert.equal(art.children.filter(x=>x.tag==='line'&&x.attrs.y1==='49').length,1);
});
test('silver uniforms render the dynamic woven nameplate inside the approved stage',()=>{
 const ui=uniform();
 const sample={dept:'politie',name:'Mxxx_',call:'660'};
 const portrait=ui.makePortrait(sample,true);
 assert.equal(portrait.dataset.uniform,'silver');
 const stage=portrait.children[0];
 assert.equal(stage.className,'bpd-silver-stage');
 const nameplate=stage.children.find(x=>x.className.includes('bpd-silver-woven-nameplate'));
 assert.ok(nameplate);
 assert.equal(nameplate.children[0].textContent,'MXXX_');
 assert.equal(nameplate.children[1].textContent,'BELGIEPD - 660');
 assert.ok(stage.children.some(x=>x.className.includes('bpd-chest-insignia')));
 assert.equal(ui.makePortrait({dept:'brandweer',name:'X',call:'ZONE'}),null);
});
test('promotion, callsign and name changes dynamically update the nameplate and grade',()=>{
 const ui=uniform();
 const before={dept:'politie',name:'Voorbeeld',call:'620'};
 const after={...before,name:'Nieuwe Naam',call:'710'};
 assert.equal(ui.nameplateData(before).bottom,'BELGIEPD - 620');
 assert.equal(ui.nameplateData(after).bottom,'BELGIEPD - 710');
 assert.equal(ui.makeNameplate(after).children[0].children.filter(x=>x.tag==='text')[0].textContent,'Nieuwe Naam');
 assert.notEqual(ui.gradeFor(before).key,ui.gradeFor(after).key);
});
test('MAIN page shows one nameplate on the uniform and no redundant detail preview',()=>{
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 const style=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(html,/makePortrait\(person,large\)/);
 assert.doesNotMatch(html,/bpd-nameplate-preview/);
 assert.doesNotMatch(html,/makeNameplate\(person,true\)/);
 assert.match(html,/navy-corrected-image-20261028/);
 assert.match(style,/\.bpd-personal-nameplate/);
 assert.match(style,/\.bpd-personal-nameplate>\.bpd-nameplate-vector/);
 assert.doesNotMatch(style,/\.bpd-nameplate-top\s*\{/);
 assert.doesNotMatch(style,/border:1px solid #283345;background:#03070e/);
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline));
});

test('all police grades load one completely isolated rank image, never a cropped sprite',()=>{
 const ui=uniform();
 const variants=[
  ['200','ap'],['300','ainp'],['400','inp'],['500','1inp'],
  ['600','ahinp'],['700','hinp'],['800','1hinp'],
  ['920','acp'],['930','acp'],['910','1cp'],['900','1hcp'],
  ['TEST-P101','cp']
 ];
 const assetNames=new Set();
 for(const [call,key] of variants){
  const person={dept:'politie',call,rank:key==='cp'?'Commissaris':''};
  assert.equal(ui.gradeFor(person)?.key,key,call);
  const badge=ui.makeBadge(person);
  assert.ok(badge);
  assert.match(badge.className,/bpd-vector-rank/);
  const svg=badge.children[0];
  assert.equal(svg.tag,'svg');
  assert.equal(svg.attrs.viewBox,'0 0 512 160');
  assert.equal(svg.children.length,1,'exactly one picture for '+call);
  const art=svg.children[0];
  assert.equal(art.tag,'image');
  assert.equal(art.attrs.href,'/assets/bpd-rank-'+key+'-clean-20261027.webp');
  // The 11 source files contain different transparent margins.
  // Every displayed embroidered frame must occupy the SAME 480x152 box
  // inside the same 512x160 SVG for all police cadres.
  const bounds={
   ap:[3,4,509,156],ainp:[3,6,509,153],inp:[3,6,509,153],
   '1inp':[31,3,481,157],ahinp:[39,3,472,157],
   hinp:[30,3,482,157],'1hinp':[27,3,484,157],
   acp:[37,3,474,157],cp:[28,3,483,156],
   '1cp':[25,3,487,157],'1hcp':[24,3,487,157]
  }[key];
  const [left,top,right,bottom]=bounds;
  const scaleX=Number(art.attrs.width)/512;
  const scaleY=Number(art.attrs.height)/160;
  const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.02,
   key+': expected '+expected+', got '+actual);
  approx(Number(art.attrs.x)+left*scaleX,16);
  approx(Number(art.attrs.y)+top*scaleY,4);
  approx((right-left)*scaleX,480);
  approx((bottom-top)*scaleY,152);
  assert.equal(art.attrs.preserveAspectRatio,'none',key);
  assetNames.add(art.attrs.href);
  // A single file must be a real photographic badge, not an HTML 404.
  const file=readFileSync(new URL('../public'+art.attrs.href,import.meta.url));
  assert.equal(file.toString('ascii',0,4),'RIFF',key);
  assert.equal(file.toString('ascii',8,12),'WEBP',key);
  assert.ok(file.length>15000&&file.length<100000,key);
 }
 assert.equal(assetNames.size,11,'all 11 independently stored badges must be covered');
 const source=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/HIGHRES_GRADE_SPRITE/);
 assert.doesNotMatch(source,/gradeSpriteIndices/);
 assert.doesNotMatch(source,/y:-160\*index/);
});
test('person cards display the grade ON the breast, not as a floating duplicate',()=>{
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(html,/btn\.append\(createPortrait\(person\),identity\)/);
 assert.doesNotMatch(html,/if\(badge\)identity\.append\(badge\)/);
});

test('nameplate uses original stitched frame, no large second black panel',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const block=css.match(/\.bpd-personal-nameplate\s*\{([^}]+)\}/)?.[1]||'';
 for(const [name,expected] of [
  ['left','17.778%'],['top','56.209%'],['width','19.306%'],['height','7.712%']
 ]){
  assert.match(block,new RegExp(name+':'+expected.replace('.','\\.')+';'));
 }
 // Existing blue stitched boundary is preserved because the SVG draws
 // no second rectangular border around the overlay.
 const start=js.indexOf(' function makeNameplate(');
 const end=js.indexOf(' function makePortrait(',start);
 const renderer=js.slice(start,end);
 assert.match(renderer,/details\.bottom/);
 assert.doesNotMatch(renderer,/x:1\.2,y:1\.2,width:317\.6/);
 assert.match(renderer,/x1:90,y1:49,x2:310,y2:49/);
});
