import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('assets/organogram-police-formal.css');
const studioCss=read('gebruikersbeheer.html');
const renderer=read('assets/organogram-police-formal.js');
const studio=read('uniform-composer-ui.js');
const finalCss=css.slice(css.indexOf('/* Grade-plaque-based nameplate'));
const studioFinal=studioCss.slice(studioCss.indexOf('/* Uniformatelier: the actual current grade art'));

test('actual mirrored grade plaque replaces hand-drawn left stripes in both UIs',()=>{
 assert.match(finalCss,/\.bpd-nameplate-mirrored-grade/);
 assert.match(finalCss,/object-fit:fill;transform:scaleX\(-1\)/);
 assert.match(finalCss,/\.bpd-nameplate-text-field/);
 assert.match(finalCss,/background:linear-gradient\(160deg,#111b2e,#060d1b\)/);
 assert.match(finalCss,/\.bpd-nameplate-left-accent\{display:none!important\}/);
 assert.doesNotMatch(finalCss,/clip-path:inset\(0 76%/);
 assert.doesNotMatch(finalCss,/repeating-linear-gradient/);
 assert.match(studioFinal,/\.compose-nameplate-mirrored-grade/);
 assert.match(studioFinal,/transform:scaleX\(-1\)/);
 assert.match(studioFinal,/\.compose-nameplate-text-field/);
 assert.doesNotMatch(studioFinal,/clip-path:inset\(0 76%/);
 assert.doesNotMatch(studioFinal,/repeating-linear-gradient/);
});

class Node{
 constructor(tag){this.tag=tag;this.className='';this.children=[];this.dataset={};this.attrs={};
  this.textContent='';this.src='';this.style={};this.classList={add:c=>{this.className+=' '+c}}}
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
test('mirrored grade art actually powers the nameplate; stars/crowns remain masked',()=>{
 const ui=uniform();
 for(const [call,key,tone] of [['900','1hcp','gold'],['910','1cp','gold'],
  ['920','acp','gold'],['930','acp','gold'],['800','1hinp','silver'],
  ['700','hinp','silver'],['600','ahinp','silver'],['500','1inp','silver'],
  ['400','inp','silver'],['300','ainp','silver'],['200','ap','silver']]){
  const portrait=ui.makePortrait({dept:'politie',call,name:'RX',awards:[]});
  const plate=portrait.children[0].children.find(n=>n.className.includes('nameplate'));
  assert.match(plate.className,new RegExp('bpd-nameplate-metal-'+tone));
  assert.equal(plate.children[0].textContent,'RX');
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+call);
  const base=plate.children[2],cover=plate.children[3];
  assert.equal(base.className,'bpd-nameplate-mirrored-grade');
  assert.equal(base.src,'/assets/bpd-rank-'+key+'-clean-20261027.webp');
  assert.equal(cover.className,'bpd-nameplate-text-field');
  assert.equal(cover.attrs['aria-hidden'],'true');
 }
});
test('rank labels without numbered calls honor gold/silver boundary as well',()=>{
 const ui=uniform();
 const gold=ui.makeNameplate({dept:'politie',rank:'Korpschef',name:'Chef'});
 const silver=ui.makeNameplate({dept:'politie',rank:'Eerste Hoofdinspecteur',name:'HINP'});
 assert.match(gold.className,/bpd-nameplate-metal-gold/);
 assert.match(silver.className,/bpd-nameplate-metal-silver/);
});
test('updated scripts and styles are independently cache-busted',()=>{
 const hierarchy=read('organogram-hierarchie.html');
 assert.match(hierarchy,/organogram-police-formal\.css\?v=uniform-grade-call-sync-20261030/);
 assert.match(hierarchy,/organogram-police-formal\.js\?v=uniform-grade-call-sync-20261030/);
 assert.match(studioCss,/uniform-composer-ui\.js\?v=uniform-grade-call-sync-20261030/);
});
