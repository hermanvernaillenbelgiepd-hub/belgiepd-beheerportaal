import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.title='';
  this.className='';this.style={setProperty:(k,v)=>{this.style[k]=v}};
  this.classList={add:x=>{this.className=[this.className,x].filter(Boolean).join(' ')}};
 }
 append(...elements){this.children.push(...elements)}
 setAttribute(k,v){this.attrs[k]=String(v)}
}
function components(){
 const scope={document:{createElement:tag=>new Element(tag),
    createElementNS:(_ns,tag)=>new Element(tag)},window:{}};
 for(const file of ['organogram-decorations.js','organogram-police-formal.js']){
  const script=readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8');
  runInNewContext(script,scope,{filename:file});
 }
 return scope.window;
}
const award=(kind,id,priority,color='red')=>({kind,id,priority,color,label:id});
const multi=[
 award('medal','ereteken_rood',30),award('ribbon','lint_blauw_goud',70,'blue-gold'),
 award('medal','ereteken_zilver',20,'silver'),award('medal','dienstmedaille_goud',60,'gold'),
 award('medal','kroon_blauw',10,'blue'),award('ribbon','lint_rood_zwart',100)
];
test('uniform layers are always ribbon -> grade -> medal and remain grade-only when empty',()=>{
 const {BPDPoliceUniform:police}=components();
 const profile=police.makePortrait({dept:'politie',call:'620',awards:multi},true);
 assert.equal(profile.children.length,2,'source image plus ordered chest group');
 const group=profile.children[1];
 assert.match(group.className,/bpd-uniform-assembly/);
 assert.deepEqual([...group.children].map(x=>x.className),
   ['bpd-uniform-ribbons','bpd-chest-insignia bpd-photo-rank','bpd-uniform-medals']);
 assert.equal(group.children[0].children.length,4,'at most 4 honour bars');
 assert.equal(group.children[2].children.length,3,'at most 3 hanging medals');
 assert.equal(police.gradeFor({dept:'politie',call:'620'}).key,'ahinp');
 assert.match(group.children[1].style['--bpd-grade-y'],/^[0-9.]+%$/);
 const simple=police.makePortrait({dept:'politie',call:'420',awards:[]},false);
 const parts=simple.children[1].children.map(x=>x.className);
 assert.deepEqual(parts,['bpd-chest-insignia bpd-photo-rank']);
});
test('no medal pendant for ribbon-only decorations',()=>{
 const {BPDDecorations:awards,BPDPoliceUniform:police}=components();
 const rack=awards.uniformRack([award('ribbon','lint_rood_zwart',100)]);
 assert.equal(rack.top.children.length,1);
 assert.equal(rack.bottom,null);
 const portrait=police.makePortrait({dept:'politie',call:'900',
  awards:[award('ribbon','lint_rood_zwart',100)]});
 assert.deepEqual([...portrait.children[1].children].map(x=>x.className),
  ['bpd-uniform-ribbons','bpd-chest-insignia bpd-photo-rank']);
});
test('placement CSS is separated and grade display is not removed by masks',()=>{
 const gradeCss=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const medalCss=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
 assert.match(gradeCss,/\.bpd-uniform-assembly>\.bpd-chest-insignia\s*\{[^}]*top:29%;[^}]*height:25%/);
 assert.match(medalCss,/\.bpd-uniform-assembly>\.bpd-uniform-ribbons\s*\{[^}]*top:4%;[^}]*height:16%/);
 assert.match(medalCss,/\.bpd-uniform-assembly>\.bpd-uniform-medals\s*\{[^}]*top:62%;[^}]*height:36%/);
 assert.doesNotMatch(gradeCss,/\.bpd-original-medal-mask\s*\{/);
});
