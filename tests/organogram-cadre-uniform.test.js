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
  const seams=rendered.children.filter(x=>x.className==='bpd-shoulder-trim');
  assert.equal(seams.length,trim==='silver-none'?0:1,'incorrect shoulder trim: '+call);
  if(seams.length){
   assert.equal(seams[0].dataset.trim,trim);
   const vector=seams[0].children[0];
   assert.equal(vector.tag,'svg');
   assert.equal(vector.attrs.viewBox,'0 0 720 765');
   const fabrics=vector.children.filter(x=>x.tag==='path'&&x.attrs.fill!=='none');
   assert.equal(fabrics.length,2,'one patch per shoulder for '+call);
   const xSpan=x=>{const m=String(x.attrs.d).match(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/);
    assert.ok(m);return Math.abs(Number(m[3])-Number(m[1]));};
   const expected={ 'gold-thick':66,'gold-thin':53,'silver-thin':49 }[trim];
   assert.ok(fabrics.every(x=>Math.abs(xSpan(x)-expected)<.01),
    'correct shoulder width and sloping direction for '+call);
   const highlights=vector.children.filter(x=>x.tag==='path'&&x.attrs.fill==='none');
   assert.equal(highlights.length,trim==='silver-thin'?2:4);
   const sample=fabrics[0].attrs.d;
   assert.ok(sample.includes(' L'),call);
   assert.equal(fabrics[0].attrs.fill,trim==='silver-thin'?'#becedb':'#deb650');
  }
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
  ['','bpd-shoulder-trim','bpd-personal-nameplate','bpd-uniform-ribbons','bpd-chest-insignia bpd-vector-rank','bpd-uniform-medals']);
 assert.equal(out.children[3].children.length,4);
 assert.equal(out.children[5].children.length,3);
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

test('narrow shoulder bands replace previous square or outlined epaulettes',()=>{
 const source=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(source,/const cleanupPolygons=\[/);
 assert.match(source,/const shoulder=makeShoulderTrim\(trim\)/);
 assert.match(source,/if\(shoulder\)outer\.append\(shoulder\)/);
 assert.match(source,/trim==='silver-thin'\|\|trim==='silver-none'/);
 assert.match(source,/const geometry=\{/);
 assert.doesNotMatch(source,/if\(trim!=='gold-thick'\)/);
 assert.doesNotMatch(source,/if\(trim==='gold-thin'\)ctx\.stroke/);
 assert.match(css,/\.bpd-police-formal>\.bpd-shoulder-trim/);
 const page=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(page,/shoulder-caps-20261027/);
});

test('shoulder depth differs by cadre, silver metalwork is retained, lower cadres have no bands',()=>{
 const {BPDPoliceUniform:p}=displayTools();
 const data=[
  ['900','gold-thick',31],['910','gold-thick',31],
  ['920','gold-thin',15],['930','gold-thin',15],
  ['600','silver-thin',4],['700','silver-thin',4],['800','silver-thin',4]
 ];
 for(const [call,trim,depth] of data){
  const photo=p.makePortrait({dept:'politie',call});
  const trimElement=photo.children.find(e=>e.className==='bpd-shoulder-trim');
  assert.ok(trimElement);
  const path=trimElement.children[0].children.find(e=>e.attrs.fill!=='none');
  const coords=[...String(path.attrs.d).matchAll(/[ML]([0-9.]+) ([0-9.]+)/g)]
    .map(x=>[Number(x[1]),Number(x[2])]);
  assert.equal(coords.length,4,call);
  assert.ok(Math.abs(coords[2][1]-coords[1][1]-depth)<.01,call);
  assert.equal(trimElement.dataset.trim,trim);
 }
 const source=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.match(source,/trim==='silver-thin'\|\|trim==='silver-none'/);
 for(const call of ['100','200','300','400','500']){
  const photo=p.makePortrait({dept:'politie',call});
  assert.ok(!photo.children.some(e=>e.className==='bpd-shoulder-trim'),call);
 }
});
