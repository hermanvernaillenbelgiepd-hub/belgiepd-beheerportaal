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
test('MAIN demo: name in black box, BELGIEPD and callsign below',()=>{
 const ui=uniform();
 const person={dept:'politie',name:'Thijs',call:'900'};
 const plate=ui.makeNameplate(person,true);
 assert.match(plate.className,/bpd-personal-nameplate/);
 assert.match(plate.className,/bpd-nameplate-zoom/);
 assert.equal(plate.children[0].className,'bpd-nameplate-stripes');
 assert.equal(plate.children[1].children[0].children[0].textContent,'Thijs');
 assert.equal(plate.children[1].children[1].textContent,'BELGIEPD - 900');
});
test('MAIN demo only: original real-nameplate not changed',()=>{
 const ui=uniform();
 const sample={dept:'politie',name:'Mxxx_',call:'660'};
 const demo=ui.makePortrait(sample,true,true);
 const real=ui.makePortrait(sample,true,false);
 const classes=item=>item.children.map(x=>x.className);
 assert.ok(classes(demo).includes('bpd-personal-nameplate'));
 assert.ok(!classes(demo).includes('bpd-silver-nameplate'));
 assert.ok(classes(real).includes('bpd-silver-nameplate'));
 assert.ok(!classes(real).includes('bpd-personal-nameplate'));
 assert.ok(classes(demo).includes('bpd-chest-insignia'));
 assert.ok(classes(real).includes('bpd-chest-insignia'));
});
test('promotion, callsign and name changes dynamically update the nameplate and grade',()=>{
 const ui=uniform();
 const before={dept:'politie',name:'Voorbeeld',call:'620'};
 const after={...before,name:'Nieuwe Naam',call:'710'};
 assert.equal(ui.nameplateData(before).bottom,'BELGIEPD - 620');
 assert.equal(ui.nameplateData(after).bottom,'BELGIEPD - 710');
 assert.equal(ui.makeNameplate(after).children[1].children[0].children[0].textContent,'Nieuwe Naam');
 assert.notEqual(ui.gradeFor(before).key,ui.gradeFor(after).key);
});
test('MAIN page only displays detail in demo, and opens requested demo preview',()=>{
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 const style=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(html,/get\('demo'\)==='naamplaat'/);
 assert.match(html,/makePortrait\(person,large,viewState\.demo\)/);
 assert.match(html,/if\(viewState\.demo&&person\.dept==='politie'\)/);
 assert.match(html,/makeNameplate\(person,true\)/);
 assert.match(html,/!internalVisible&&!demoNameplateRequested/);
 assert.match(style,/\.bpd-nameplate-zoom/);
 assert.match(style,/\.bpd-nameplate-stripes/);
 assert.match(style,/\.bpd-nameplate-bottom/);
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline));
});
