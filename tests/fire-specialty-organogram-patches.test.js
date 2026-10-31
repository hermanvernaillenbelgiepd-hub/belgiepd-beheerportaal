import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const uploader=readFileSync(new URL('../public/role-artwork-ui.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
const between=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,'missing code anchors '+start);
 return html.slice(a,b);
};
const source=between('let fireSpecialtyPatchArtworks=new Map();','function setServiceUniformData(')+
 '\n'+between("function specialtyBranch(branch,isPolice,nested=false,department=''){","function filteredRows(){");
class Node {
 constructor(tag,cls='',text=''){
  this.tag=tag;this.className=cls;this.textContent=text;this.children=[];
  this.attrs={};this.style={};this.title='';this.dataset={};
 }
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=[...items]}
 setAttribute(name,value){this.attrs[name]=value}
 addEventListener(){}
 get childElementCount(){return this.children.length}
}
const el=(...args)=>new Node(...args);
function view(){
 const context={el,state:{specialtyOpen:{}},isTeacher:()=>false,
  peopleList:()=>el('div','persons'),specialtyPeopleList:()=>el('div','persons')};
 return runInNewContext(source+'\n({setFireSpecialtyPatchArtworks,fireSpecialtyPatchCode,fireSpecialtyPatchUrl,specialtyBranch})',
  context);
}
const file=(code,version='a1')=>'/api/role-artwork/file/specialty_brandweer_'+code+'?v='+version;
const artwork=(code,version='a1')=>({kind:'specialty',department:'brandweer',
 code,imageUrl:file(code,version)});

test('every fire speciality gets a visible 32px slot without changing the seven-column layout',()=>{
 const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 assert.match(css,/\.fire-specialty-patch\{/);
 assert.match(css,/width:32px;height:32px/);
 assert.match(css,/\.fire-specialty-title-text\{/);
 assert.match(css,/grid-template-columns:repeat\(var\(--fire-specialty-count,6\),minmax\(0,1fr\)\)/);
 assert.match(html,/specialtyBranch\(branch,false,false,settings\.id\)/);
 const viewApi=view();
 for(const label of ['Duiker','Gevaarlijke stoffen','Ladderwagen','Logistiek',
   'Overige leden (geen geregistreerde specialisatie)','RED team','Signalisatie']){
  const card=viewApi.specialtyBranch({label,members:[]},false,false,'brandweer');
  const header=card.children[0];
  assert.match(header.className,/fire-specialty-title/);
  assert.match(header.children[0].className,/fire-specialty-patch/);
  assert.equal(header.children[0].children[0].textContent,'◇');
  assert.equal(header.children[1].children[0].textContent,label);
 }
});
test('uploaded fire badges are selected by specialty code, not by personnel or access rights',()=>{
 const api=view();
 api.setFireSpecialtyPatchArtworks([
  artwork('duiker','one-1'),artwork('gevaarlijke_stoffen','two-1'),
  artwork('red_team','three-1'),artwork('signalisatie_lokaal','four-1'),
  {kind:'specialty',department:'politie',code:'ladderwagen',imageUrl:file('ladderwagen')},
  {kind:'specialty',department:'brandweer',code:'logistiek',imageUrl:'https://untrusted.invalid/logo.png'}
 ]);
 for(const [label,code] of [
  ['Duiker','duiker'],['Gevaarlijke stoffen','gevaarlijke_stoffen'],
  ['RED-team','red_team'],['RED team','red_team'],
  ['Signalisatie','signalisatie_lokaal']]){
  const badge=api.specialtyBranch({label,members:[]},false,false,'brandweer')
   .children[0].children[0];
  assert.equal(badge.children[0].src,
    file(code,code==='duiker'?'one-1':code==='gevaarlijke_stoffen'?'two-1':
      code==='red_team'?'three-1':'four-1'));
 }
 assert.equal(api.fireSpecialtyPatchUrl('Ladderwagen'),'');
 assert.equal(api.fireSpecialtyPatchUrl('Logistiek'),'');
});
test('non-fire specialties keep their existing header behavior and no patch',()=>{
 const api=view();
 const other=api.specialtyBranch({label:'Ambulance opleiding',members:[]},false,false,'ambulance');
 assert.doesNotMatch(other.children[0].className,/fire-specialty/);
 assert.ok(!other.children[0].children.some(child=>child.className==='fire-specialty-patch'));
});
test('uploaded specialty badges are manageable from the existing role artwork section',()=>{
 for(const code of ['duiker','ladderwagen','logistiek','gevaarlijke_stoffen',
    'red_team','overige_leden','signalisatie']){
  assert.match(uploader,new RegExp("'"+code+"'"));
 }
 assert.match(admin,/Specialisatiepatch \(organogram en personeelslijst\)/);
 assert.match(admin,/role-artwork-ui\.js\?v=fire-specialty-patches-20261031/);
 assert.match(html,/setFireSpecialtyPatchArtworks\(artworkManifest\?\.artworks\)/);
});
