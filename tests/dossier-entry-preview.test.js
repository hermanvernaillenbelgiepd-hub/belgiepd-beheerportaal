import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dossierPreviewText,dossierAuthorFacts,dossierAuthorLine,
 attachDossierRecordPreview} from '../public/dossier-entry-preview.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('compacte omschrijving toont slechts een korte maar leesbare samenvatting',()=>{
 assert.equal(dossierPreviewText('Een gewone korte zin'), 'Een gewone korte zin');
 assert.equal(dossierPreviewText('Eerste regel\nTweede regel'), 'Eerste regel Tweede regel');
 const full='Vertrouwelijke dossierdetails met aanvullende uitleg '.repeat(10);
 const small=dossierPreviewText(full,88);
 assert.ok(small.length<=88);
 assert.ok(small.endsWith('…'));
 assert.equal(full.length>small.length,true);
});
test('historische invoerder, graad, roepnummer en overnemer blijven gescheiden',()=>{
 const record={eventDate:'2026-11-19',eventTime:'19:30',
  registeredBy:{name:'Oorspronkelijke observator',rank:'Inspecteur',call:'430'},
  submittedByActor:{name:'Overnemend kaderlid',rank:'Commissaris',call:'930'},
  historicalImport:true,onBehalfReason:'Overname uit spreadsheet'};
 const facts=dossierAuthorFacts(record);
 assert.equal(facts.name,'Oorspronkelijke observator');
 assert.equal(facts.rank,'Inspecteur');
 assert.equal(facts.call,'430');
 assert.equal(facts.importer,'Overnemend kaderlid');
 assert.match(dossierAuthorLine(record),/Oorspronkelijke invoerder: Oorspronkelijke observator/);
});
test('ontbrekende historische graad wordt niet verzonnen of vervangen door huidige graad',()=>{
 const record={registeredBy:{name:'Onbekend historisch lid',call:'601'}};
 assert.equal(dossierAuthorFacts(record).rank,'');
 assert.equal(dossierAuthorLine(record),'Door Onbekend historisch lid · 601');
 assert.equal(dossierAuthorFacts({byDiscordId:'123456789012345678'}).name,
  '123456789012345678');
});
test('volledige brontekst blijft bewaard in de geopende detailweergave',()=>{
 const old=globalThis.document;
 class Node{
  constructor(tag){this.tagName=tag;this.textContent='';this.children=[];
   this.className='';this.classList={add:v=>{this.className+=' '+v}};this.attrs={}}
  append(...nodes){this.children.push(...nodes)}
  setAttribute(k,v){this.attrs[k]=v}
 }
 globalThis.document={createElement:tag=>new Node(tag)};
 try{
  const item=new Node('div'),body=new Node('p'),meta=new Node('span');
  const text='Grote notitie met veel informatie. '.repeat(30);
  const row={eventDate:'2026-11-19',details:text,
   registeredBy:{name:'Opleider',rank:'Adjudant',call:'720'}};
  item.append(body,meta);
  attachDossierRecordPreview(item,{row,title:'Belangrijke notitie',
   text,bodyNode:body,metaNode:meta});
  assert.ok(body.textContent.length<text.length);
  assert.match(meta.textContent,/Adjudant/);
  const details=item.children.at(-1);
  assert.equal(details.tagName,'details');
  assert.equal(details.children[1].children[1].textContent,text);
  assert.match(details.children[0].attrs['aria-label'],/Volledige gegevens/i);
  assert.match(details.children[1].children[2].children[1].children[1].textContent,/Adjudant/);
 }finally{globalThis.document=old}
});
test('alle dossierweergaven gebruiken alleen bestaande geautoriseerde registers',()=>{
 for(const path of ['public/personeelsbeheer.html','public/brandweerdossier.html',
  'public/burger-personeelsdossiers.html']){
  const html=source(path);
  assert.match(html,/\/dossier-entry-preview\.js/);
  assert.match(html,/attachDossierRecordPreview\(/);
  assert.match(html,/createObservationDisclosure\(\{/);
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,path+' heeft module');
  const result=spawnSync(process.execPath,['--check','--input-type=module'],
   {input:script,encoding:'utf8'});
  assert.equal(result.status,0,path+': '+result.stderr);
 }
 const css=source('public/bpd-dossier-shared.css');
 assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
 assert.match(css,/bpd-dossier-inspector-content/);
 assert.match(css,/bpd-observation-content/);
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) body/);
 assert.match(css,/summary:focus-visible/);
});
test('fire source toont historische graad uitsluitend indien opgeslagen',()=>{
 const sourceRoute=source('src/fire-dossier-routes.js');
 assert.match(sourceRoute,/registeredRank:clean\(r\.registeredBy\?\.rank,100\)/);
 const police=source('public/personeelsbeheer.html');
 assert.match(police,/dossierAuthorLine\(row\)/);
 assert.match(police,/bodyNode:details,metaNode:author/);
});
