import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {canManagePoliceDecoration} from '../src/personnel-decoration-policy.js';
import {validateComposition} from '../src/uniform-composition-routes.js';

const officer={uid:'discord:222222222222222222',discordId:'222222222222222222',
 role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},
 dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']};
const corps={...officer,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'}};
const person=(rank,id='111111111111111111')=>({dept:'politie',personId:id,rank});
test('officer and corps can grant/revoke decoration to ANY police grade including corps',()=>{
 for(const actor of [officer,corps])
  for(const rank of ['Inspecteur','Eerste Hoofdinspecteur','Commissaris','Eerste Hoofdcommissaris','Korpschef'])
   assert.equal(canManagePoliceDecoration(actor,person(rank)),true,actor.role+': '+rank);
 assert.equal(canManagePoliceDecoration(officer,person('Eerste Hoofdcommissaris',officer.discordId)),true);
});
test('decoration power does not confer personnel edits, cross-service powers or insecure logins',()=>{
 assert.equal(canManagePoliceDecoration({...officer,role:'middenkader'},person('Inspecteur')),false);
 assert.equal(canManagePoliceDecoration({...officer,uid:'google:222222222222222222'},person('Korpschef')),false);
 assert.equal(canManagePoliceDecoration({...officer,dossierNativeDepartments:[]},person('Korpschef')),false);
 assert.equal(canManagePoliceDecoration({...officer,portalTechnicalMode:true},person('Korpschef')),false);
 assert.equal(canManagePoliceDecoration(officer,{dept:'brandweer',personId:'111111111111111111'}),false);
 const policy=readFileSync(new URL('../src/personnel-decoration-policy.js',import.meta.url),'utf8');
 assert.doesNotMatch(policy,/return canReadPersonnelSubject\(actor,subject\)&&canEditPersonnel\(actor,subject\)/);
});
test('old coat IDs cannot be saved in a new composition',()=>{
 const layers=Object.fromEntries(['name','rank','ribbons','medals','helmet','profession','logo']
  .map(k=>[k,{left:20,top:30,width:20,height:20,visible:true}]));
 const payload={department:'politie',scope:'call',selector:'900',
  assets:{uniform:'ceremonieel_nieuw',rank:'1hcp'},layers,
  reason:'Nieuw uniform gekozen en goedgekeurd'};
 assert.equal(validateComposition(payload).assets.uniform,'ceremonieel_nieuw');
 for(const code of ['gold','silver','default'])
  assert.throws(()=>validateComposition({...payload,assets:{...payload.assets,uniform:code}}),/oude standaarduniform/);
});
class El{
 constructor(tag){this.tag=tag;this.children=[];this.className='';this.dataset={};
  this.attrs={};this.src='';this.textContent='';this.style={setProperty(){}};
  this.classList={add:x=>{this.className+=' '+x}};this.complete=false;}
 append(...els){this.children.push(...els)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
const load=(withCoat=false)=>{
 const env={window:{},document:{createElement:tag=>new El(tag),
  createElementNS:(_ns,tag)=>new El(tag)}};
 env.window.BPDUniformAssignments={forPerson:()=>({
  uniformUrl:withCoat?'/api/role-artwork/file/uniform_politie_ceremonieel_nieuw?v=123':'',
  rankUrl:'',visualLayout:null})};
 runInNewContext(readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8'),env);
 return env.window.BPDPoliceUniform;
};
test('old gold and silver coat photos are NEVER loaded on unassigned personnel',()=>{
 const u=load();
 for(const call of ['900','920','600','300']){
  const view=u.makePortrait({dept:'politie',call,name:'Voorbeeld',awards:[]});
  assert.match(view.className,/bpd-uniform-missing/);
  assert.equal(view.children[0].textContent,'Geen nieuw uniform ingesteld');
  assert.ok(!view.children.some(x=>x.src));
 }
});
test('real uploaded coat renders woven gold/silver nameplates and current rank',()=>{
 const u=load(true);
 for(const [call,tone] of [['900','gold'],['930','gold'],['700','silver'],['400','silver']]){
  const view=u.makePortrait({dept:'politie',call,name:'RX',awards:[]});
  const stage=view.children[0];
  assert.match(stage.children[0].src,/uniform_politie_ceremonieel_nieuw/);
  const plate=stage.children.find(x=>x.className.includes('nameplate'));
  assert.match(plate.className,new RegExp('bpd-nameplate-metal-'+tone));
  assert.equal(plate.children[0].textContent,'RX');
  assert.equal(plate.children[1].textContent,'BELGIEPD - '+call);
 }
 const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 assert.match(css,/repeating-linear-gradient\(129deg/);
 assert.match(css,/var\(--thread\)/);
});
