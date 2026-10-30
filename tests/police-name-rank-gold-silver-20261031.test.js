import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
class El{
 constructor(tag){this.tag=tag;this.className='';this.children=[];this.dataset={};
  this.attrs={};this.style={setProperty(){}};this.classList={add:s=>{this.className+=' '+s}}}
 append(...xs){this.children.push(...xs)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(){}
}
function renderer(){
 const win={BPDUniformAssignments:{forPerson:()=>({
  uniformUrl:'/api/role-artwork/file/uniform_politie_nieuw?v=123',rankUrl:'',visualLayout:null})}};
 runInNewContext(read('assets/organogram-police-formal.js'),
  {window:win,document:{createElement:t=>new El(t),createElementNS:(_ns,t)=>new El(t)}});
 return win.BPDPoliceUniform;
}
test('officer crowns stay gold but the original diagonal threads remain silver',()=>{
 const ui=renderer();
 const officers=[
  {call:'920',rank:'ACP'},{call:'910',rank:'1CP'},{call:'900',rank:'1HCP'},
  {rank:'ACP'},{rank:'CP'},{rank:'1CP'},
  {rank:'AHCP'},{rank:'A-HCP'},{rank:'HCP'},{rank:'1HCP'},
  {rank:'Aspirant Hoofdcommissaris'},{rank:'Hoofdcommissaris'},
  {rank:'Eerste Hoofdcommissaris'}
 ];
 for(const person of officers){
  const p=ui.makePortrait({dept:'politie',name:'TEST',awards:[],...person});
  const nodes=p.children[0].children;
  const name=nodes.find(x=>x.className.includes('bpd-woven-nameplate'));
  const grade=nodes.find(x=>x.className.includes('bpd-chest-insignia'));
  assert.equal(p.dataset.uniform,'gold',person.rank);
  assert.match(name.className,/bpd-nameplate-metal-gold/,person.rank);
  assert.match(grade.className,/bpd-rank-metal-gold/,person.rank);
 }
});
test('AHINP, HINP, 1HINP and all lower ranks keep original silver embroidery',()=>{
 const ui=renderer();
 for(const person of [
  {call:'800',rank:'1HINP'},{call:'700',rank:'HINP'},
  {call:'600',rank:'AHINP'},{call:'500',rank:'1INP'},
  {call:'400',rank:'INP'},{call:'300',rank:'AINP'},
  {call:'200',rank:'AP'},{rank:'Aspirant Hoofdinspecteur'},
  {rank:'Hoofdinspecteur'},{rank:'Eerste Hoofdinspecteur'}]){
  const p=ui.makePortrait({dept:'politie',name:'TEST',awards:[],...person});
  const nodes=p.children[0].children;
  assert.equal(p.dataset.uniform,'silver',person.rank);
  assert.match(nodes.find(x=>x.className.includes('bpd-woven-nameplate')).className,
   /bpd-nameplate-metal-silver/,person.rank);
  assert.match(nodes.find(x=>x.className.includes('bpd-chest-insignia')).className,
   /bpd-rank-metal-silver/,person.rank);
 }
});
test('real crowns untouched and all diagonal threads silver, without synthetic stripes',()=>{
 const css=read('assets/organogram-police-formal.css');
 const admin=read('gebruikersbeheer.html');
 const composer=read('uniform-composer-ui.js');
 for(const source of [css,admin]){
  assert.match(source,/#e0e7ef/);
  assert.doesNotMatch(source,/#ffd044/);
  assert.match(source,/content:none!important;display:none!important/);
  assert.match(source,/object-fit:contain/);
 }
 // Gold nameplate text remains; photographic diagonal strokes are silver.
 assert.match(css,/--line-thread:#e0e7ef/);
 assert.match(admin,/--plate-line-thread:#e0e7ef/);
 assert.doesNotMatch(css,/background:#ffd24b/);
 assert.doesNotMatch(admin,/background:#ffd24b/);
 assert.match(css,/bpd-grade-metal-gold::after,[\s\S]*?content:none!important/);
 assert.match(css,/bpd-rank-metal-gold::after,[\s\S]*?content:none!important/);
 assert.match(admin,/compose-rank-metal-gold::after,[\s\S]*?content:none!important/);
 assert.match(composer,/compose-rank-metal-gold/);
 assert.match(composer,/compose-rank-metal-silver/);
 assert.match(read('organogram-hierarchie.html'),/all-police-grades-20261031-v3/);
 assert.match(admin,/uniform-composer-ui\\.js\\?v=all-police-grades-20261031-v3/);
});
