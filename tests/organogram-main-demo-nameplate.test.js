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
 assert.equal(art.children.filter(x=>x.tag==='line'&&x.attrs.y1==='50').length,1);
});
test('all police portraits in real and demo views use the new silver nameplate',()=>{
 const ui=uniform();
 const sample={dept:'politie',name:'Mxxx_',call:'660'};
 const portrait=ui.makePortrait(sample,true);
 const classes=portrait.children.map(x=>x.className);
 assert.ok(classes.includes('bpd-personal-nameplate'));
 assert.ok(!classes.includes('bpd-silver-nameplate'));
 assert.ok(classes.includes('bpd-chest-insignia'));
 const nameplate=portrait.children.find(x=>x.className==='bpd-personal-nameplate');
 assert.deepEqual(nameplate.children[0].children.filter(x=>x.tag==='text')
  .map(x=>x.textContent),['Mxxx_','BELGIEPD - 660']);
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
 assert.match(html,/stitched-inset-20261027/);
 assert.match(style,/\.bpd-personal-nameplate/);
 assert.match(style,/\.bpd-personal-nameplate>\.bpd-nameplate-vector/);
 assert.doesNotMatch(style,/\.bpd-nameplate-top\s*\{/);
 assert.doesNotMatch(style,/border:1px solid #283345;background:#03070e/);
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline));
});

test('all four first grades have a crisp SVG underline; regular grades do not',()=>{
 const ui=uniform();
 for(const [call,underlined] of [
  ['500',true],['800',true],['910',true],['900',true],
  ['400',false],['700',false],['920',false],['300',false],
  ['200',false]
 ]){
  const badge=ui.makeBadge({dept:'politie',call});
  assert.ok(badge);
  assert.match(badge.className,/bpd-vector-rank/);
  const svg=badge.children[0];
  assert.equal(svg.tag,'svg');
  assert.equal(svg.attrs.viewBox,'0 0 160 70');
  const rule=svg.children.filter(n=>n.tag==='line'&&n.attrs.y1==='58'&&n.attrs.y2==='58');
  assert.equal(rule.length,underlined?1:0,'incorrect underline for callsign '+call);
  // An inserted bitmap would become blurred when browser zoom changes.
  assert.equal(svg.children.filter(n=>n.tag==='image').length,0);
 }
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
