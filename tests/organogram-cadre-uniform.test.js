import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class El{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.className='';this.src='';
  this.style={setProperty:(name,v)=>{this.style[name]=v}};
  this.classList={add:name=>this.className=[this.className,name].filter(Boolean).join(' ')};
 }
 setAttribute(k,v){this.attrs[k]=v}
 append(...v){this.children.push(...v)}
}
function displayTools(){
 const scope={
  window:{},
  document:{createElement:tag=>new El(tag),createElementNS:(_ns,tag)=>new El(tag)}
 };
 for(const name of ['organogram-decorations.js','organogram-police-formal.js']){
  const js=readFileSync(new URL('../public/assets/'+name,import.meta.url),'utf8');
  runInNewContext(js,scope,{filename:name});
 }
 return scope.window;
}
const award=(kind,id,priority,color='red')=>({kind,id,priority,color,label:id});
test('shoulder trim: heavy gold 900/910, thin gold officer, hairline silver middle, no border lower',()=>{
 const {BPDPoliceUniform:p}=displayTools();
 for(const [call,trim] of [['900','gold-thick'],['910','gold-thick'],
    ['920','gold-thin'],['930','gold-thin'],
    ['100','silver-none'],['200','silver-none'],['300','silver-none'],
    ['400','silver-none'],['500','silver-none'],
    ['600','silver-thin'],['700','silver-thin'],['800','silver-thin']]){
  const person={dept:'politie',call};
  assert.equal(p.trimFor(p.gradeFor(person)),trim,call);
  const rendered=p.makePortrait(person);
  assert.equal(rendered.dataset.trim,trim,call);
  assert.ok(rendered.children.some(x=>x.className.includes('bpd-chest-insignia')),call);
 }
 assert.equal(p.trimFor(p.gradeFor({dept:'politie',call:'TEST-X',rank:'Commissaris van Politie'})),'gold-thin');
});
test('ribbons, insignia, medals are distinct ordered elements, no broad rectangular mask',()=>{
 const {BPDPoliceUniform:p}=displayTools();
 const person={dept:'politie',call:'620',awards:[
  award('medal','ereteken_rood',30),award('ribbon','lint_rood_zwart',100),
  award('medal','ereteken_zilver',20,'silver'),
  award('medal','dienstmedaille_goud',60,'gold'),
  award('medal','kroon_blauw',10,'blue'),
  award('ribbon','lint_blauw_goud',70,'blue-gold')
 ]};
 const out=p.makePortrait(person,true);
 assert.equal(out.dataset.trim,'silver-thin');
 assert.deepEqual([...out.children].map(x=>x.className),
  ['','bpd-personal-nameplate','bpd-uniform-ribbons','bpd-chest-insignia bpd-photo-rank','bpd-uniform-medals']);
 assert.equal(out.children[2].children.length,4);
 assert.equal(out.children[4].children.length,3);
 const noAwards=p.makePortrait({dept:'politie',call:'300',awards:[]});
 assert.equal(noAwards.children.length,3);
 assert.match(noAwards.children[1].className,/bpd-personal-nameplate/);
 assert.match(noAwards.children[2].className,/bpd-chest-insignia/);
});
test('uniform is presentation-only; granting and expiring retain server policy',()=>{
 const root=new URL('../public/assets/',import.meta.url);
 const css=readFileSync(new URL('organogram-police-formal.css',root),'utf8');
 const decorations=readFileSync(new URL('organogram-decorations.css',root),'utf8');
 assert.match(css,/\.bpd-police-formal>\.bpd-chest-insignia/);
 assert.match(decorations,/\.bpd-police-formal>\.bpd-uniform-ribbons/);
 assert.match(decorations,/\.bpd-police-formal>\.bpd-uniform-medals/);
 assert.doesNotMatch(css,/\.bpd-original-medal-mask\s*\{/);
 const backend=readFileSync(new URL('../src/personnel-decoration-policy.js',import.meta.url),'utf8');
 assert.match(backend,/isDecorationActive/);
 assert.match(backend,/canManagePoliceDecoration/);
});

test('silver-only lower cadre details preserve the clean bare shoulders',()=>{
 const source=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.match(source,/trim==='silver-thin'\|\|trim==='silver-none'/);
 assert.match(source,/if\(trim==='silver-thin'\)\{/);
 assert.match(source,/if\(trim==='gold-thin'\)ctx\.stroke\(\)/);
 assert.match(source,/ctx\.moveTo\(pts\[0\]\[0\]\*scaleX,pts\[0\]\[1\]\*scaleY\)/);
 // Base and agent shoulder polygons must be filled with navy, never
 // stroked in silver. The only silver stroke branch is middle cadre.
 assert.doesNotMatch(source,/trim==='silver-none'\)\s*ctx\.stroke/);
});
