import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const uploader=readFileSync(new URL('../public/role-artwork-ui.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
function between(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,'missing '+start);
 return html.slice(a,b);
}
const source=between('let ambulanceSpecialtyPatchArtworks=new Map();','function setServiceUniformData(')+'\n'+
 between("function specialtyBranch(branch,isPolice,nested=false,department=''){","function filteredRows(){");
class E {
 constructor(tag,cls='',text=''){
  this.tag=tag;this.className=cls;this.textContent=text;this.children=[];
  this.attrs={};this.style={};this.title='';this.dataset={};
 }
 append(...xs){this.children.push(...xs)}
 replaceChildren(...xs){this.children=[...xs]}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
 get childElementCount(){return this.children.length}
}
const el=(...args)=>new E(...args);
function api(){
 return runInNewContext(source+'\n({setAmbulanceSpecialtyPatchArtworks,ambulanceSpecialtyPatchCode,ambulanceSpecialtyPatchUrl,specialtyBranch})',
 {el,state:{specialtyOpen:{}},isTeacher:()=>false,peopleList:()=>el('div','persons'),
  specialtyPeopleList:()=>el('div','persons'),
  makeFireSpecialtyPatch:()=>el('span','fire-specialty-patch')});
}
const url=(code,v='one-1')=>'/api/role-artwork/file/specialty_ambulance_'+code+'?v='+v;
const artwork=code=>({kind:'specialty',department:'ambulance',code,imageUrl:url(code)});

test('ambulance specialization cards have a 32x32 slot just like fire',()=>{
 const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 assert.match(css,/\.service\[data-dept="ambulance"\] \.fire-specialty-patch\{/);
 assert.match(css,/width:32px;height:32px/);
 assert.match(css,/\.service\[data-dept="ambulance"\]>.service-body>.spec-list>.specialty>summary\.fire-specialty-title/);
 const view=api();
 for(const label of ['MUG-HELI','PIT','PIT-MOTOR','Medicatie','MIP','Verpleegkundige','Overige leden']){
  const card=view.specialtyBranch({label,members:[]},false,false,'ambulance');
  const header=card.children[0],slot=header.children[0];
  assert.match(header.className,/fire-specialty-title/);
  assert.match(slot.className,/fire-specialty-patch/);
  assert.equal(slot.children[0].textContent,'◇');
  assert.equal(header.children[1].children[0].textContent,label);
 }
});
test('upload manifest can match AZLS labels safely and never leak fire patches',()=>{
 const view=api();
 view.setAmbulanceSpecialtyPatchArtworks([
  artwork('mug_heli'),artwork('pit_motor'),artwork('medicatie'),artwork('mip'),
  artwork('pit_lokaal'),artwork('verpleegkundige'),
  {kind:'specialty',department:'brandweer',code:'duiker',imageUrl:url('duiker')},
  {kind:'specialty',department:'ambulance',code:'arts',imageUrl:'https://untrusted.example/a.jpg'}
 ]);
 for(const [label,code] of [['MUG-HELI','mug_heli'],['MUG HELI','mug_heli'],
  ['PIT-MOTOR','pit_motor'],['PIT','pit_lokaal'],['Medicatie','medicatie'],
  ['MIP','mip'],['Verpleegkundige','verpleegkundige']]){
  const slot=view.specialtyBranch({label,members:[]},false,false,'ambulance').children[0].children[0];
  assert.equal(slot.children[0].src,url(code),label);
 }
 assert.equal(view.ambulanceSpecialtyPatchUrl('Duiker'),'');
 assert.equal(view.ambulanceSpecialtyPatchUrl('Arts'),'');
 const nonAmbulance=view.specialtyBranch({label:'PIT',members:[]},false,false,'depannage');
 assert.ok(!nonAmbulance.children[0].children.some(node=>node.className==='fire-specialty-patch'));
});
test('AZLS accepts PATCH uploads and rejects mismatched or external artwork',()=>{
 const app=api();
 const patch='/api/role-artwork/file/patch_ambulance_pit?v=patch-2';
 app.setAmbulanceSpecialtyPatchArtworks([
  {kind:'patch',department:'ambulance',code:'pit',imageUrl:patch},
  {kind:'patch',department:'politie',code:'mip',
   imageUrl:'/api/role-artwork/file/patch_politie_mip?v=wrong-1'},
  {kind:'patch',department:'ambulance',code:'medicatie',
   imageUrl:'/api/role-artwork/file/patch_brandweer_medicatie?v=wrong-1'},
  {kind:'patch',department:'ambulance',code:'heli',
   imageUrl:'https://untrusted.example/patch.png'}
 ]);
 assert.equal(app.ambulanceSpecialtyPatchUrl('PIT'),patch);
 assert.equal(app.ambulanceSpecialtyPatchUrl('MIP'),'');
 assert.equal(app.ambulanceSpecialtyPatchUrl('Medicatie'),'');
 assert.equal(app.ambulanceSpecialtyPatchUrl('HELI'),'');
 const slot=app.specialtyBranch({label:'PIT',members:[]},false,false,'ambulance')
  .children[0].children[0];
 assert.equal(slot.children[0].src,patch);
 app.setAmbulanceSpecialtyPatchArtworks([
  {kind:'patch',department:'ambulance',code:'pit',imageUrl:patch},
  {kind:'specialty',department:'ambulance',code:'pit',
   imageUrl:'/api/role-artwork/file/specialty_ambulance_pit?v=specialty-3'}]);
 assert.equal(app.ambulanceSpecialtyPatchUrl('PIT'),
  '/api/role-artwork/file/specialty_ambulance_pit?v=specialty-3');
});
test('existing uploads and new square AZLS preview are available to managers',()=>{
 for(const key of ['mug_heli','pit','pit_motor','medicatie','mip','verpleegkundige']){
  assert.match(uploader,new RegExp("'"+key+"'"));
 }
 assert.match(uploader,/kind==='specialty'&&\$p\('roleArtworkDepartment'\)\.value==='ambulance'\?\[320,320\]/);
 assert.match(admin,/AZLS-patches: kies bijvoorbeeld/);
 assert.match(admin,/role-artwork-ui\.js\?v=service-roles-20261106/);
 assert.match(html,/setAmbulanceSpecialtyPatchArtworks\(artworkManifest\?\.artworks\)/);
});
