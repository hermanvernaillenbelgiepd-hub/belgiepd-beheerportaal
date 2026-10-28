import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
class El{
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.src='';
  this.className='';this.textContent='';this.style={setProperty(){}};
  this.classList={add:k=>{this.className+=(this.className?' ':'')+k}};
 }
 append(...n){this.children.push(...n)}
 setAttribute(k,v){this.attrs[k]=v}
}
function load(){
 const env={window:{},document:{
  createElement:tag=>new El(tag),
  createElementNS:(_ns,tag)=>new El(tag)}};
 for(const filename of ['organogram-decorations.js','organogram-police-formal.js']){
  runInNewContext(readFileSync(new URL('../public/assets/'+filename,import.meta.url),'utf8'),env);
 }
 return env.window.BPDPoliceUniform;
}
test('the TEST-approved blank textile nameplate exists on MAIN as real WebP',()=>{
 const asset=readFileSync(new URL('../public/assets/bpd-naamplaat-geweven-leeg-20261028.webp',import.meta.url));
 assert.equal(asset.toString('ascii',0,4),'RIFF');
 assert.equal(asset.toString('ascii',8,12),'WEBP');
 assert.ok(asset.length>40000&&asset.length<65000);
});
test('gold portraits show woven plate with current uppercase name and callsign',()=>{
 const ui=load();
 for(const [call,grade] of [['900','1hcp'],['910','1cp'],['920','acp'],['930','acp']]){
  const person={dept:'politie',name:'Jones',call,awards:[]};
  const portrait=ui.makePortrait(person);
  assert.equal(portrait.dataset.uniform,'gold',call);
  const stage=portrait.children[0];
  const name=stage.children.find(x=>x.className.includes('bpd-gold-nameplate'));
  assert.ok(name,call);
  assert.equal(name.children[0].textContent,'JONES',call);
  assert.equal(name.children[1].textContent,'BELGIEPD - '+call,call);
  const cloth=stage.children.find(x=>x.className.includes('bpd-gold-cloth-rank'));
  assert.equal(cloth.dataset.grade,grade,call);
  assert.equal(cloth.children[0].src,'/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
 }
 const after=ui.makePortrait({dept:'politie',name:'Nieuwe Naam',call:'910'});
 const label=after.children[0].children.find(x=>x.className.includes('bpd-gold-nameplate'));
 assert.equal(label.children[0].textContent,'NIEUWE NAAM');
 assert.equal(label.children[1].textContent,'BELGIEPD - 910');
});
test('same approved woven patch is used independently by gold and silver',()=>{
 const ui=load();
 const silver=ui.makePortrait({dept:'politie',call:'720',name:'Jones',awards:[]});
 assert.equal(silver.dataset.uniform,'silver');
 const stage=silver.children[0];
 assert.equal(stage.className,'bpd-silver-stage');
 const name=stage.children.find(x=>x.className.includes('bpd-silver-woven-nameplate'));
 assert.equal(name.children[0].textContent,'JONES');
 assert.equal(name.children[1].textContent,'BELGIEPD - 720');
 const rank=stage.children.find(x=>x.className.includes('bpd-silver-cloth-rank'));
 assert.equal(rank.dataset.grade,'hinp');
 assert.equal(rank.children[0].src,'/assets/bpd-rank-hinp-clean-20261027.webp');
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(css,/bpd-naamplaat-geweven-leeg-20261028\.webp/);
 assert.match(css,/aspect-ratio:1032\/381/);
 assert.match(css,/top:20%;height:25%/); // gold
 assert.match(css,/top:57%;height:28%/); // gold
 assert.match(css,/left:10\.25%;top:56\.2%;width:27\.75%/); // silver
 const html=readFileSync(new URL('../public/organogram.html',import.meta.url),'utf8');
 assert.match(html,/darker-officers-20261028/);
});
