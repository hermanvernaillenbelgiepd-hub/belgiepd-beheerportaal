import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierStatusPresentation,renderDossierStatus} from '../public/dossier-identity-presentation.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Dossierstatus toont correct kleurtype en icoon per werkelijke status',()=>{
 const expected=[
  ['Actief','success'],['Verlof','leave'],['Inactief','inactive'],
  ['50/50','attention'],['NON-ACTIEF','nonactive'],['Verwijderd','removed'],
  ['Geschorst','danger'],['Stage','pending'],['RESTRICTED','attention'],
  ['Blacklisted','removed'],['LEIDING','lead']
 ];
 for(const [label,kind] of expected){
  const result=dossierStatusPresentation(label);
  assert.equal(result.kind,kind,label);
  assert.ok(result.icon.length>0);
  assert.equal(result.label,label);
 }
 assert.equal(dossierStatusPresentation('Actief',{leave:true}).label,'Verlof');
 assert.equal(dossierStatusPresentation('Actief',{leave:true}).kind,'leave');
 assert.equal(dossierStatusPresentation(undefined).kind,'unknown');
});

test('Statuspictogram is decoratief; de echte status blijft als tekst leesbaar',()=>{
 const previous=globalThis.document;
 const createElement=tag=>({
  tag,dataset:{},children:[],textContent:'',attributes:{},
  setAttribute(key,value){this.attributes[key]=value},
  append(...items){this.children.push(...items)}
 });
 globalThis.document={createElement};
 try{
  const target={children:[],attributes:{},
   setAttribute(key,value){this.attributes[key]=value},
   replaceChildren(...children){this.children=children}};
  renderDossierStatus(target,'Actief');
  assert.equal(target.children.length,1);
  const pill=target.children[0];
  assert.equal(pill.dataset.tone,'success');
  assert.equal(pill.children[0].attributes['aria-hidden'],'true');
  assert.equal(pill.children[1].textContent,'Actief');
  assert.equal(target.attributes['aria-label'],'Personeelsstatus: Actief');
 }finally{globalThis.document=previous}
});

test('Dossierpresentatie is uniform op politie, ambulance, depannage, brandweer en burger',()=>{
 for(const path of ['public/personeelsbeheer.html',
  'public/brandweerdossier.html','public/burger-personeelsdossiers.html']){
  const source=read(path);
  assert.match(source,/\/dossier-identity-polish\.css/);
  assert.match(source,/\/dossier-identity-presentation\.js/);
  assert.match(source,/renderDossierStatus\(/);
 }
 const css=read('public/dossier-identity-polish.css');
 assert.match(css,/#sheetRank \.dossier-rank-inline img/);
 assert.match(css,/#sheetSeries \.dossier-series-heads/);
 assert.match(css,/#sheetName/);
 assert.match(css,/#personRole/);
 assert.match(css,/data-tone="success"/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(read('public/dossier-identity-presentation.js'),
  /fetch\(|Firestore|setDoc|updateDoc|Discord|axios|localStorage/);
});
