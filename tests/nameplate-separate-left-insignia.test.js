import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('assets/organogram-police-formal.css');
const studioCss=read('gebruikersbeheer.html');
const finalCss=css.slice(css.indexOf('/* FINAL left accent'));
const studioFinal=studioCss.slice(studioCss.indexOf('/* Uniformatelier parity: a separate thin'));

test('retired filled corner is explicitly disabled on both current and preview badges',()=>{
 assert.match(finalCss,/\.bpd-gold-nameplate::before,/);
 assert.match(finalCss,/content:none!important;display:none!important/);
 assert.match(finalCss,/background:none!important/);
 assert.match(studioFinal,/\.compose-nameplate::before\{[\s\S]*?content:none!important/);
 assert.doesNotMatch(finalCss,/repeating-linear-gradient/);
 assert.doesNotMatch(studioFinal,/repeating-linear-gradient/);
});
test('ornament is a separate thin four-stripe left element, never part of the text field',()=>{
 assert.match(finalCss,/\.bpd-nameplate-left-accent-stripe:nth-child\(4\)/);
 assert.match(studioFinal,/\.compose-nameplate-left-accent-stripe:nth-child\(4\)/);
 assert.match(finalCss,/background:linear-gradient\(90deg,transparent 0 19%,/);
 assert.match(studioFinal,/background:linear-gradient\(90deg,transparent 0 19%,/);
 assert.match(finalCss,/left:22%;width:74%/);
 assert.match(studioFinal,/left:22%;width:74%/);
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
  uniformUrl:'/api/role-artwork/file/uniform_politie_current',visualLayout:null
 })}};
 const doc={createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
 runInNewContext(read('assets/organogram-police-formal.js'),{window:win,document:doc});
 return win.BPDPoliceUniform;
}
test('officer and lower rank use the same left insignia and keep actual gold/silver colors',()=>{
 const ui=uniform();
 for(const [call,tone] of [['900','gold'],['910','gold'],['920','gold'],['930','gold'],
  ['700','silver'],['400','silver']]){
  const view=ui.makePortrait({dept:'politie',call,name:'RX',awards:[]});
  const plate=view.children[0].children.find(n=>n.className.includes('nameplate'));
  assert.match(plate.className,new RegExp('bpd-nameplate-metal-'+tone));
  assert.equal(plate.children[0].textContent,'RX');
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+call);
  const accent=plate.children[2];
  assert.equal(accent.className,'bpd-nameplate-left-accent');
  assert.equal(accent.attrs['aria-hidden'],'true');
  assert.equal(accent.children.length,4);
  assert.ok(accent.children.every(n=>n.className==='bpd-nameplate-left-accent-stripe'));
 }
});
test('new CSS and JS are cache-busted on real personnel and atelier pages',()=>{
 const organigram=read('organogram-hierarchie.html');
 assert.match(organigram,/organogram-police-formal\.css\?v=separate-left-accent-20261030/);
 assert.match(organigram,/organogram-police-formal\.js\?v=separate-left-accent-20261030/);
 assert.match(studioCss,/uniform-composer-ui\.js\?v=separate-left-accent-20261030/);
});
