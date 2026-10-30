import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('assets/organogram-police-formal.css');
const admin=read('gebruikersbeheer.html');
const renderer=read('assets/organogram-police-formal.js');
const composer=read('uniform-composer-ui.js');
const finalCss=css.slice(css.indexOf('/* BelgiumPD – single flat textile nameplate'));
const studioFinal=admin.slice(admin.indexOf('/* The operational organogram and Uniformatelier share'));

test('flat reference-style nameplate replaces the nested mirrored grade image in both views',()=>{
 assert.match(finalCss,/bpd-woven-nameplate::before/);
 assert.match(finalCss,/repeating-linear-gradient/);
 assert.match(finalCss,/border:0!important;border-radius:0!important/);
 assert.match(finalCss,/transform:scale\(1\.32,1\.42\)/);
 assert.match(studioFinal,/compose-woven-nameplate::before/);
 assert.match(studioFinal,/background-color:#122542/);
 assert.doesNotMatch(renderer,/bpd-nameplate-mirrored-grade|bpd-nameplate-text-field/);
 assert.doesNotMatch(composer,/compose-nameplate-mirrored-grade|compose-nameplate-text-field/);
});

class Node{
 constructor(tag){this.tag=tag;this.className='';this.children=[];this.dataset={};this.attrs={};
  this.textContent='';this.src='';this.style={setProperty(){}};this.classList={add:c=>{this.className+=' '+c}};}
 append(...xs){this.children.push(...xs)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
function uniform(){
 const win={BPDUniformAssignments:{forPerson:()=>({
  uniformUrl:'/api/role-artwork/file/uniform_politie_current',
  visualLayout:null,rankUrl:null})}};
 const doc={createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag)};
 runInNewContext(renderer,{window:win,document:doc});
 return win.BPDPoliceUniform;
}
test('nameplate is one woven element, actual grade stays separate for every cadre',()=>{
 const ui=uniform();
 const cases=[['900','1hcp','gold'],['910','1cp','gold'],
  ['920','acp','gold'],['930','acp','gold'],['800','1hinp','silver'],
  ['700','hinp','silver'],['600','ahinp','silver'],['500','1inp','silver'],
  ['400','inp','silver'],['300','ainp','silver'],['200','ap','silver']];
 for(const [call,grade,tone] of cases){
  const portrait=ui.makePortrait({dept:'politie',call,name:'RX',awards:[]});
  const nodes=portrait.children[0].children;
  const plate=nodes.find(n=>n.className.includes('bpd-woven-nameplate'));
  const rank=nodes.find(n=>n.className.includes('cloth-rank'));
  assert.ok(plate&&rank,call);
  assert.match(plate.className,new RegExp('bpd-nameplate-metal-'+tone),call);
  assert.equal(plate.children.length,2,call);
  assert.equal(plate.children[0].textContent,'RX');
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+call);
  assert.equal(rank.dataset.grade,grade,call);
  assert.equal(rank.children[0].src,'/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
 }
});
test('non-numbered display ranks still select gold/silver properly',()=>{
 const ui=uniform();
 const gold=ui.makeNameplate({dept:'politie',rank:'Korpschef',name:'Chef'});
 const silver=ui.makeNameplate({dept:'politie',rank:'Eerste Hoofdinspecteur',name:'HINP'});
 assert.match(gold.className,/bpd-nameplate-metal-gold/);
 assert.match(silver.className,/bpd-nameplate-metal-silver/);
});
test('new live and studio assets are cache-busted',()=>{
 const hierarchy=read('organogram-hierarchie.html');
 assert.match(hierarchy,/organogram-police-formal\.css\?v=flat-woven-nameplate-20261030-r2/);
 assert.match(hierarchy,/organogram-police-formal\.js\?v=flat-woven-nameplate-20261030-r2/);
 assert.match(admin,/uniform-composer-ui\.js\?v=flat-woven-nameplate-20261030-r2/);
});
