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
test('MAIN regular organogram: name in black box, BELGIEPD and callsign below',()=>{
 const ui=uniform();
 const person={dept:'politie',name:'Thijs',call:'900'};
 const plate=ui.makeNameplate(person,true);
 assert.match(plate.className,/bpd-personal-nameplate/);
 assert.match(plate.className,/bpd-nameplate-zoom/);
 assert.equal(plate.children[0].className,'bpd-nameplate-stripes');
 assert.equal(plate.children[1].children[0].children[0].textContent,'Thijs');
 assert.equal(plate.children[1].children[1].textContent,'BELGIEPD - 900');
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
 assert.equal(nameplate.children[1].children[0].children[0].textContent,'Mxxx_');
 assert.equal(nameplate.children[1].children[1].textContent,'BELGIEPD - 660');
 assert.equal(ui.makePortrait({dept:'brandweer',name:'X',call:'ZONE'}),null);
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
test('MAIN page shows enlarged nameplate in both real and demo views',()=>{
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 const style=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(html,/get\('demo'\)==='naamplaat'/);
 assert.match(html,/makePortrait\(person,large\)/);
 assert.match(html,/if\(person\.dept==='politie'\)/);
 assert.match(html,/viewState\.demo\?'Naamplaat · FICTIEF VOORBEELD':'Naamplaat · BelgiumPD'/);
 assert.match(html,/makeNameplate\(person,true\)/);
 assert.match(html,/!internalVisible&&!demoNameplateRequested/);
 assert.match(style,/\.bpd-nameplate-zoom/);
 assert.match(style,/\.bpd-nameplate-stripes/);
 assert.match(style,/\.bpd-nameplate-bottom/);
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline));
});
