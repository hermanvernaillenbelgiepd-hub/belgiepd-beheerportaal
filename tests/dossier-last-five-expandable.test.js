import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRecentDossierEntries,attachExpandableDossierText,DOSSIER_RECENT_COUNT}
 from '../public/dossier-recent-entries.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

class MockElement{
 constructor(tag){this.tagName=tag.toUpperCase();this.className='';this.textContent='';
  this.children=[];this.parentNode=null;this.open=false;this.listeners={};}
 append(...nodes){
  for(const node of nodes){if(typeof node==='string'){this.children.push(node);continue}
    this.children.push(node);node.parentNode=this;}
 }
 replaceChildren(...nodes){this.children=[];this.textContent='';this.append(...nodes)}
 after(node){
  if(!this.parentNode)throw Error('Element not mounted');
  const i=this.parentNode.children.indexOf(this);
  this.parentNode.children.splice(i+1,0,node);node.parentNode=this.parentNode;
 }
 addEventListener(event,callback){this.listeners[event]=callback}
}
function withMockDom(run){
 const original=globalThis.document;
 globalThis.document={createElement:tag=>new MockElement(tag)};
 try{return run()}finally{globalThis.document=original}
}
const dates=Array.from({length:9},(_,i)=>({
 id:'record-'+i,eventDate:'2026-11-'+String(i+1).padStart(2,'0'),
 details:'Uitgebreide notitie '+i
}));
test('Vijf recentste registraties direct zichtbaar; overige onder één details, chronologisch',()=>withMockDom(()=>{
 assert.equal(DOSSIER_RECENT_COUNT,5);
 const root=new MockElement('div');
 const received=[];
 const count=renderRecentDossierEntries(root,dates,(parent,row)=>{
   received.push(row.id);
   const item=document.createElement('article');item.textContent=row.id;
   parent.append(item);
 });
 assert.equal(count,9);
 assert.equal(root.children.length,6);
 assert.deepEqual(root.children.slice(0,5).map(x=>x.textContent),
   ['record-8','record-7','record-6','record-5','record-4']);
 const older=root.children[5];
 assert.equal(older.tagName,'DETAILS');
 assert.equal(older.open,false);
 assert.match(older.children[0].textContent,/Toon 4 oudere/);
 assert.deepEqual(older.children[1].children.map(x=>x.textContent),
   ['record-3','record-2','record-1','record-0']);
 older.open=true;older.listeners.toggle();
 assert.match(older.children[0].textContent,/Verberg 4 oudere/);
 assert.equal(received.length,9);
}));
test('Alle vijf tonen zonder lege uitklap; nul en bronlimiet krijgen duidelijke melding',()=>withMockDom(()=>{
 const root=new MockElement('div');
 renderRecentDossierEntries(root,dates.slice(0,5),(mount,row)=>{
   const item=document.createElement('article');item.textContent=row.id;mount.append(item)
 });
 assert.equal(root.children.length,5);
 renderRecentDossierEntries(root,[],()=>{},{
   empty:'Geen verlofperiodes',limited:true,noun:'verlofperiodes'});
 assert.equal(root.children.length,2);
 assert.equal(root.children[0].textContent,'Geen verlofperiodes');
 assert.match(root.children[1].textContent,/bron kan nog oudere/);
}));
test('Verlofperiodes worden op ingangsdatum gesorteerd, zonder oude records te verwijderen',()=>withMockDom(()=>{
 const root=new MockElement('div');
 const data=[
   {startDate:'2026-07-01',endDate:'2026-07-12'},
   {startDate:'2026-11-01',endDate:'2026-11-08'},
   {startDate:'2026-09-01',endDate:'2026-09-05'},
   {startDate:'2026-05-01',endDate:'2026-05-07'},
   {startDate:'2026-08-01',endDate:'2026-08-03'},
   {startDate:'2026-10-01',endDate:'2026-10-08'}
 ];
 renderRecentDossierEntries(root,data,(mount,row)=>{
   const d=document.createElement('div');d.textContent=row.startDate;mount.append(d)
 },{noun:'verlofperiodes'});
 assert.deepEqual(root.children.slice(0,5).map(x=>x.textContent),
   ['2026-11-01','2026-10-01','2026-09-01','2026-08-01','2026-07-01']);
 assert.equal(root.children[5].children[1].children[0].textContent,'2026-05-01');
}));
test('Lange omschrijving kan volledig opengeklapt worden, korte niet',()=>withMockDom(()=>{
 const card=document.createElement('div'),short=document.createElement('p');
 card.append(short);
 assert.equal(attachExpandableDossierText(card,short,'Korte notitie'),null);
 assert.equal(short.textContent,'Korte notitie');
 assert.equal(card.children.length,1);
 const body=document.createElement('p');card.append(body);
 const long='Opmerking met context: '+('volledige toelichting '.repeat(20)).trim();
 const toggle=attachExpandableDossierText(card,body,long,{limit:95});
 assert.ok(toggle);
 assert.equal(toggle.tagName,'DETAILS');
 assert.match(body.textContent,/…$/);
 assert.equal(toggle.children[1].textContent,long);
 assert.equal(card.children.indexOf(toggle),card.children.indexOf(body)+1);
}));
test('Alle vijf dossiers delen de vijf-regelregel, zonder wijziging aan toegangsrechten',()=>{
 const police=read('public/personeelsbeheer.html');
 const fire=read('public/brandweerdossier.html');
 const citizen=read('public/burger-personeelsdossiers.html');
 const helper=read('public/dossier-recent-entries.js');
 for(const page of [police,fire,citizen]){
   assert.match(page,/from '\/dossier-recent-entries\.js'/);
   assert.match(page,/renderRecentDossierEntries/);
   assert.match(page,/attachExpandableDossierText/);
 }
 assert.match(police,/renderRecentDossierEntries\(root,leaves/);
 assert.match(police,/renderRecentDossierEntries\(root,records/);
 assert.match(police,/return renderRecentDossierEntries\(root,entries,append/);
 assert.match(fire,/renderRecentDossierEntries\(root,items/);
 assert.match(fire,/renderRecentDossierEntries\(root,proposals/);
 assert.match(citizen,/return renderRecentDossierEntries\(container,items,render/);
 assert.match(citizen,/fill\('observations'/);
 assert.match(citizen,/fill\('sanctions'/);
 assert.match(helper,/const older=document\.createElement\('details'\)/);
 assert.doesNotMatch(citizen,/id="citizenLeave"/);
});
