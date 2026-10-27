import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
class Element {
 constructor(tag){
  this.tag=tag;this.children=[];this.className='';this.dataset={};
  this.attrs={};this.title='';this.textContent='';
 }
 append(...children){this.children.push(...children)}
 setAttribute(key,value){this.attrs[key]=value}
}
const getUniform=()=>{
 const global={window:{},document:{
  createElement:tag=>new Element(tag),
  createElementNS:(_namespace,tag)=>new Element(tag)
 }};
 const script=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 runInNewContext(script,global,{filename:'organogram-police-formal.js'});
 return global.window.BPDPoliceUniform;
};
const leafTexts=element=>[element.textContent,...(element.children||[]).flatMap(leafTexts)].filter(Boolean);
test('BelgiumPD nameplate has silver stripes, the name in the black top field and callsign underneath',()=>{
 const uniform=getUniform();
 const plate=uniform.makeNameplate({dept:'politie',name:'Thijs',call:'900'},true);
 assert.match(plate.className,/bpd-nameplate-zoom/);
 assert.equal(plate.children[0].className,'bpd-nameplate-stripes');
 assert.equal(plate.children[1].children[0].children[0].textContent,'Thijs');
 assert.equal(plate.children[1].children[1].textContent,'BELGIEPD - 900');
});
test('promotion and name changes recompute both lines without stored duplicates',()=>{
 const uniform=getUniform();
 const previous={dept:'politie',name:'Voorbeeld',call:'620',rank:'Aspirant-hoofdinspecteur'};
 const promoted={...previous,name:'Nieuwe Naam',call:'710',rank:'Hoofdinspecteur'};
 const oldPlate=uniform.makeNameplate(previous);
 const newPlate=uniform.makeNameplate(promoted);
 assert.deepEqual(leafTexts(oldPlate).slice(-2),['Voorbeeld','BELGIEPD - 620']);
 assert.deepEqual(leafTexts(newPlate).slice(-2),['Nieuwe Naam','BELGIEPD - 710']);
 assert.notEqual(uniform.gradeFor(previous).key,uniform.gradeFor(promoted).key);
});
test('uniform portrait and magnified preview use identical current staff data',()=>{
 const uniform=getUniform();
 const person={dept:'politie',name:'Mxxx_',call:'660',rank:'Aspirant-hoofdinspecteur'};
 const picture=uniform.makePortrait(person,true);
 const attached=picture.children.find(x=>x.className==='bpd-personal-nameplate');
 assert.ok(attached);
 assert.equal(attached.children[1].children[1].textContent,'BELGIEPD - 660');
 assert.ok(picture.children.some(x=>x.className==='bpd-chest-insignia'));
 assert.equal(uniform.makeNameplate({dept:'brandweer',name:'X',call:'ZONE'}),null);
});
test('TEST organogram embeds nameplate preview and shares stylesheet with the portrait',()=>{
 const page=readFileSync(new URL('../public/organogram-test.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(page,/makeNameplate\(person,true\)/);
 assert.match(page,/nameplate-test-1/);
 assert.match(css,/\.bpd-nameplate-zoom/);
 assert.match(css,/\.bpd-nameplate-stripes/);
 assert.match(css,/\.bpd-nameplate-bottom/);
 assert.doesNotMatch(page,/\/api\/personnel-awards\/catalog-upload/);
 const inline=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline));
});
