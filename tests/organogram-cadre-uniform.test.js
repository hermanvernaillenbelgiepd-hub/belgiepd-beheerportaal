import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class El {
 constructor(tag){
  this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.className='';this.src='';
  this.style={setProperty:(name,v)=>{this.style[name]=v}};
  this.classList={add:name=>this.className=[this.className,name].filter(Boolean).join(' ')};
 }
 setAttribute(k,v){this.attrs[k]=v}
 append(...v){this.children.push(...v)}
}
function displayTools(){
 const scope={window:{},
  document:{createElement:tag=>new El(tag),createElementNS:(_ns,tag)=>new El(tag)}};
 for(const name of ['organogram-decorations.js','organogram-police-formal.js']){
  const js=readFileSync(new URL('../public/assets/'+name,import.meta.url),'utf8');
  runInNewContext(js,scope,{filename:name});
 }
 return scope.window;
}
const award=(kind,id,priority,color='red')=>({kind,id,priority,color,label:id});

test('four cadre uniforms: only corps leadership retains original gold shoulder pieces',()=>{
 const p=displayTools().BPDPoliceUniform;
 const cases=[
  ['900','1hcp','gold-thick'],['910','1cp','gold-thick'],
  ['920','acp','gold-none'],['930','acp','gold-none'],
  ['800','1hinp','silver-none'],['700','hinp','silver-none'],
  ['600','ahinp','silver-none'],['500','1inp','silver-none'],
  ['400','inp','silver-none'],['300','ainp','silver-none'],
  ['200','ap','silver-none'],['100','ap','silver-none']
 ];
 for(const [call,grade,trim] of cases){
  const person={dept:'politie',call};
  const rank=p.gradeFor(person);
  assert.equal(rank.key,grade,call);
  assert.equal(p.trimFor(rank),trim,call);
  const portrait=p.makePortrait(person);
  assert.equal(portrait.dataset.trim,trim,call);
  assert.ok(!portrait.children.some(x=>x.className.includes('shoulder-trim')),call);
 }
 assert.equal(p.trimFor(p.gradeFor({dept:'politie',call:'TEST-X',
  rank:'Commissaris van Politie'})),'gold-none');
});

test('the chest and separate grade badge use the genuine isolated embroidered asset',()=>{
 const p=displayTools().BPDPoliceUniform;
 const calls={'900':'1hcp','910':'1cp','920':'acp','930':'acp',
  '800':'1hinp','700':'hinp','600':'ahinp',
  '500':'1inp','400':'inp','300':'ainp','200':'ap'};
 for(const [call,grade] of Object.entries(calls)){
  const person={dept:'politie',call};
  const expected='/assets/bpd-rank-'+grade+'-clean-20261027.webp';
  const portrait=p.makePortrait(person);
  const holder=portrait.children[0];
  const chest=holder.children.find(x=>x.className.includes('bpd-chest-insignia'));
  assert.ok(chest,'chest rank on '+call);
  assert.equal(chest.dataset.grade,grade);
  assert.equal(chest.children[0].src,expected,'cloth rank '+call);
  assert.equal(portrait.children[0].children[0].src,
   portrait.dataset.uniform==='gold'?p.asset:p.silverAsset);
  const badge=p.makeBadge(person);
  assert.equal(badge.children[0].children[0].attrs.href,expected,'badge '+call);
 }
});

test('ribbons, rank plate and medals are independent layers without shoulder masks',()=>{
 const p=displayTools().BPDPoliceUniform;
 const person={dept:'politie',call:'620',awards:[
  award('medal','ereteken_rood',30),award('ribbon','lint_rood_zwart',100),
  award('medal','ereteken_zilver',20,'silver'),
  award('medal','dienstmedaille_goud',60,'gold'),
  award('medal','kroon_blauw',10,'blue'),
  award('ribbon','lint_blauw_goud',70,'blue-gold')
 ]};
 const out=p.makePortrait(person,true);
 assert.equal(out.dataset.trim,'silver-none');
 assert.equal(out.children.length,1);
 assert.equal(out.children[0].className,'bpd-silver-stage');
 assert.deepEqual([...out.children[0].children].map(x=>x.className),[
  'bpd-silver-coat', 'bpd-personal-nameplate bpd-silver-woven-nameplate',
  'bpd-uniform-ribbons', 'bpd-chest-insignia bpd-silver-cloth-rank',
  'bpd-uniform-medals'
 ]);
 assert.equal(out.children[0].children[2].children.length,4);
 assert.equal(out.children[0].children[4].children.length,3);
 const noAwards=p.makePortrait({dept:'politie',call:'300',awards:[]});
 assert.equal(noAwards.children.length,1);
 const stage=noAwards.children[0];
 assert.equal(stage.children.length,3);
 assert.match(stage.children[1].className,/bpd-silver-woven-nameplate/);
 assert.match(stage.children[2].className,/bpd-silver-cloth-rank/);
});

test('old gold canvas masks are removed; approved image is not recoloured',()=>{
 const source=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(source,/const GOLD_BASE=/);
 assert.match(source,/bpd-gold-stage/);
 assert.doesNotMatch(source,/preparedUniform\(/);
 assert.doesNotMatch(source,/cleanupPolygons/);
 assert.doesNotMatch(css,/\.bpd-police-formal>\.bpd-shoulder-trim/);
 assert.match(css,/\.bpd-gold-stage>/);
 assert.match(readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8'),
  /navy-matched-officers-20261028/);
});

test('uniform presentation does not confer or change service permissions',()=>{
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const decorations=readFileSync(new URL('../public/assets/organogram-decorations.css',import.meta.url),'utf8');
 assert.match(css,/\.bpd-police-formal>\.bpd-chest-insignia/);
 assert.match(decorations,/\.bpd-police-formal>\.bpd-uniform-ribbons/);
 assert.match(decorations,/\.bpd-police-formal>\.bpd-uniform-medals/);
 const backend=readFileSync(new URL('../src/personnel-decoration-policy.js',import.meta.url),'utf8');
 assert.match(backend,/isDecorationActive/);
 assert.match(backend,/canManagePoliceDecoration/);
});
