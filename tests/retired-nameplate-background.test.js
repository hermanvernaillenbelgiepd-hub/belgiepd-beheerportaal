import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
const script=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.className='';this.children=[];this.dataset={};
  this.attrs={};this.src='';this.textContent='';this.style={};
  this.classList={add:c=>{this.className+=' '+c}}}
 append(...children){this.children.push(...children)}
 addEventListener(){}
 setAttribute(k,v){this.attrs[k]=v}
}
function portrait(call){
 const window={BPDUniformAssignments:{forPerson:()=>({
  uniformUrl:'/api/role-artwork/file/uniform_politie_new_coat',rankUrl:'',
  visualLayout:{name:{left:26,top:34,width:18,height:9,visible:true}}})}};
 const document={createElement:tag=>new Element(tag),
  createElementNS:(_ns,tag)=>new Element(tag)};
 runInNewContext(script,{window,document});
 window.BPDPoliceUniform.setUniformManagementData([],[],[
  {key:'politie_gold',variant:'gold',configured:true,left:4,top:4,width:70,height:70,
   nameScale:100,callScale:100},
  {key:'politie_silver',variant:'silver',configured:true,left:4,top:4,width:70,height:70,
   nameScale:100,callScale:100}
 ],[]);
 return window.BPDPoliceUniform.makePortrait({dept:'politie',name:'RX',call,awards:[]});
}
test('historical woven nametag image and CSS hatch no longer appear in active styles',()=>{
 assert.doesNotMatch(css,/url\(['"]?\/assets\/bpd-naamplaat-geweven-leeg-20261028\.webp/);
 assert.doesNotMatch(css,/background:repeating-linear-gradient\(115deg/);
 assert.doesNotMatch(css,/background:repeating-linear-gradient\(135deg,#d0dce7/);
 assert.match(css,/\.bpd-woven-nameplate/);
 assert.doesNotMatch(script,/bpd-nameplate-mirrored-grade|bpd-nameplate-text-field/);
});
test('old gold/silver positional overrides cannot cover or duplicate current nameplate',()=>{
 assert.doesNotMatch(script,/\bapplyUniformNameplatePlacement\(plate,'gold'\)/);
 assert.doesNotMatch(script,/\bapplyUniformNameplatePlacement\(nameplate,'silver'\)/);
 for(const call of ['900','700']){
  const result=portrait(call);
  const stage=result.children[0];
  const plates=stage.children.filter(x=>x.className.includes('bpd-personal-nameplate'));
  assert.equal(plates.length,1);
  assert.equal(plates[0].style.left,'26%');
  assert.equal(plates[0].style.top,'34%');
  assert.equal(plates[0].style.width,'18%');
  assert.equal(plates[0].style.height,'9%');
  assert.equal(plates[0].children[0].textContent,'RX');
  assert.equal(plates[0].children[1].textContent,'BELGIEPD - '+call);
 }
});
