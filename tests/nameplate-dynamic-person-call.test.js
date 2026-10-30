import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const load=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.className='';this.children=[];this.attrs={};
  this.dataset={};this.textContent='';this.src='';this.style={};
  this.classList={add:c=>{this.className+=' '+c}};}
 append(...children){this.children.push(...children)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
function uniforms(){
 const win={BPDUniformAssignments:{forPerson:()=>({
  uniformUrl:'/api/role-artwork/file/uniform_politie_nieuw',
  visualLayout:null,rankUrl:null})}};
 const dom={createElement:tag=>new Element(tag),
  createElementNS:(_namespace,tag)=>new Element(tag)};
 runInNewContext(load('assets/organogram-police-formal.js'),{window:win,document:dom});
 return win.BPDPoliceUniform;
}
test('nameplate uses individual member name and BELGIEPD - numeric CALL (without FUNCTIE)',()=>{
 const u=uniforms();
 for(const person of [
  {name:'Thijs',call:'900',expected:'900'},
  {name:'RX',call:'SANTO-770',expected:'770'},
  {name:'Jane Doe',call:'S700',expected:'700'},
  {name:'Voorbeeld',call:'400',expected:'400'}]){
  const v=u.makePortrait({dept:'politie',...person,awards:[]});
  const plate=v.children[0].children.find(x=>x.className.includes('nameplate'));
  assert.equal(plate.children[0].textContent,person.name.toUpperCase());
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+person.expected);
  assert.equal(plate.children.length,2);
  assert.match(plate.className,/bpd-woven-nameplate/);
  assert.doesNotMatch(plate.children.map(x=>x.textContent||'').join(' '),/V\. NAAM|DIENST|FUNCTIE/i);
 }
});
test('retired service prefix cannot override the agreed BELGIEPD label',()=>{
 const u=uniforms();
 u.setUniformManagementData([],[],[{
  key:'politie_gold',variant:'gold',configured:true,
  prefix:'OUD',left:20,top:34,width:25,height:10,
  nameScale:100,callScale:100
 }],[]);
 const v=u.makePortrait({dept:'politie',call:'900',name:'Thijs',awards:[]});
 const plate=v.children[0].children.find(x=>x.className.includes('nameplate'));
 assert.equal(plate.children[1].textContent,'BELGIEPD - 900');
});
test('studio displays exact same text as operational organogram',()=>{
 const composer=load('uniform-composer-ui.js');
 assert.match(composer,/const callLabel=dept\.value==='politie'\?'BELGIEPD - '\+member\.call:member\.call/);
 assert.match(composer,/el\('strong','compose-name',member\.name\)/);
 assert.match(composer,/el\('small','compose-call',callLabel\)/);
 assert.match(composer,/number\|\|rawCall/);
 assert.doesNotMatch(composer,/el\('small','compose-call',member\.call\)/);
});
