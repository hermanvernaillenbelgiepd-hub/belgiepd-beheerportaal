import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {policeCallDigits,policeCallSeries} from '../public/uniform-profile-policy.js';

class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};
  this.className='';this.src='';this.textContent='';
  this.style={setProperty(){}};this.complete=false;
  this.classList={add:v=>{this.className+=' '+v}};
 }
 append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attrs[key]=value;}
 addEventListener(){}
}
const file=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
function renderer(){
 const win={BPDUniformAssignments:{forPerson:p=>({
  uniformUrl:'/api/role-artwork/file/uniform_politie_current?v=123',
  rankUrl:p.customRankUrl||'',callSeries:policeCallSeries(p.call),
  visualLayout:p.visualLayout||null
 })}};
 const dom={createElement:tag=>new Element(tag),
  createElementNS:(_ns,tag)=>new Element(tag)};
 runInNewContext(file,{window:win,document:dom});
 return win.BPDPoliceUniform;
}
const cases=[
 ['100','100','ap','silver'],['SANTO-205*','205','ap','silver'],
 ['S302','302','ainp','silver'],['SANTO-485','485','inp','silver'],
 ['501','501','1inp','silver'],['SANTO-600*','600','ahinp','silver'],
 ['SANTO 730','730','hinp','silver'],['S815*','815','1hinp','silver'],
 ['900','900','1hcp','gold'],['SANTO-905*','905','1hcp','gold'],
 ['S910','910','1cp','gold'],['SANTO 915','915','1cp','gold'],
 ['SANTO-920','920','acp','gold'],['S930*','930','acp','gold']
];
test('all personnel and radio calls resolve identical grade and nameplate identity',()=>{
 const ui=renderer();
 for(const [call,digits,grade,tone] of cases){
  assert.equal(policeCallDigits(call),digits,call);
  assert.equal(ui.gradeFor({dept:'politie',call}).key,grade,call);
  const person={dept:'politie',call,name:'RX',awards:[]};
  const portrait=ui.makePortrait(person);
  assert.equal(portrait.dataset.uniform,tone,call);
  const stage=portrait.children[0];
  const plate=stage.children.find(x=>x.className.includes('personal-nameplate'));
  const patch=stage.children.find(x=>x.className.includes('cloth-rank'));
  assert.ok(plate&&patch,call);
  assert.match(plate.className,new RegExp('metal-'+tone),call);
  assert.equal(plate.children[0].textContent,'RX',call);
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+digits,call);
  assert.equal(plate.children[2].src,'/assets/bpd-rank-'+grade+'-clean-20261027.webp',call);
  assert.equal(patch.dataset.grade,grade,call);
  assert.equal(patch.children[0].src,plate.children[2].src,call);
  assert.equal(stage.children.filter(x=>x.className.includes('personal-nameplate')).length,1,call);
 }
});
test('specific uploaded grade artwork is identical on nameplate and rank panel',()=>{
 const ui=renderer();
 const person={dept:'politie',call:'SANTO-710*',name:'Voorbeeld',
  customRankUrl:'/api/role-artwork/file/rank_politie_eigen_patch?v=123'};
 const p=ui.makePortrait(person);
 const nodes=p.children[0].children;
 const plate=nodes.find(x=>x.className.includes('personal-nameplate'));
 const rank=nodes.find(x=>x.className.includes('cloth-rank'));
 assert.equal(plate.children[2].src,person.customRankUrl);
 assert.equal(rank.children[0].src,person.customRankUrl);
});
test('invalid identifiers and other service calls never masquerade as police ranks',()=>{
 for(const call of ['ABC-700','UID123456789012345','930-extra','008','940','']){
  assert.equal(policeCallDigits(call),'',call);
  assert.equal(policeCallSeries(call),'',call);
 }
 const ui=renderer();
 assert.equal(ui.gradeFor({dept:'brandweer',call:'900'}),null);
 assert.equal(ui.gradeFor({dept:'politie',call:'TEST-P101',rank:'Agent van Politie'}).key,'ap');
});
