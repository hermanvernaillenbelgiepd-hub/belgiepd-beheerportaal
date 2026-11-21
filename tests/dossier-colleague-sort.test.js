import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {sortDossierColleagues,DOSSIER_COLLEAGUE_DEPARTMENTS}
 from '../public/dossier-colleague-sort.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ctx={window:{}};runInNewContext(source('public/personnel-list-visuals.js'),ctx);
const compare=ctx.window.BPDPersonnelVisuals.comparePersonnel;
const entry=(dept,call,name,canOpenDossier=true)=>({
 dept,call,name,discordId:'id-'+dept+'-'+call+'-'+name,
 canOpenDossier
});

test('open dossier kiest collega volgens de originele politielijst: honderdreeksen aflopend, binnen reeks oplopend',()=>{
 const police=['008','430','710','610','920','900','530','720','930','910','700','800','100','600','200']
   .map(call=>entry('politie',call,'Agent '+call));
 police.push(entry('politie','999','GEHEIM',false));
 const found=sortDossierColleagues(police,compare);
 assert.deepEqual(found.map(p=>p.call),[
  '900','910','920','930','800','700','710','720','600','610','530','430','200','100','008']);
 assert.equal(found.some(p=>p.name==='GEHEIM'),false);
 assert.equal(police[0].call,'008','Mag invoervolgorde niet wijzigen');
});

test('dossierkeuzelijst volgt voor elke dienst de officiële personeelsvolgorde',()=>{
 const rows=[
  entry('burger','BIO-1','Zara'),entry('brandweer','STAG-01','Stagiair'),
  entry('ambulance','AMB-12','Ambulancier'),entry('depannage','LSRA-3','Depanneur'),
  entry('politie','900','Korpsleiding'),entry('brandweer','ZONE','Zonechef'),
  entry('ambulance','DIRMED','Dirmed'),entry('depannage','AWV','Leiding'),
  entry('burger','BIO-2','Anna'),entry('brandweer','OFF-02','Officier'),
  entry('depannage','FAST-1','FAST'),entry('ambulance','HARTS-1','Harts'),
  entry('politie','008','Beheer'),entry('politie','910','Korpsleiding 2')
 ];
 const result=sortDossierColleagues(rows,compare);
 assert.deepEqual(result.map(p=>p.dept),
  ['politie','politie','politie','brandweer','brandweer','brandweer',
   'ambulance','ambulance','ambulance','depannage','depannage','depannage','burger','burger']);
 assert.deepEqual(result.filter(p=>p.dept==='brandweer').map(p=>p.call),
  ['ZONE','OFF-02','STAG-01']);
 assert.deepEqual(result.filter(p=>p.dept==='ambulance').map(p=>p.call),
  ['DIRMED','HARTS-1','AMB-12']);
 assert.deepEqual(result.filter(p=>p.dept==='depannage').map(p=>p.call),
  ['AWV','FAST-1','LSRA-3']);
 assert.deepEqual(result.filter(p=>p.dept==='burger').map(p=>p.name),
  ['Anna','Zara']);
 assert.deepEqual(DOSSIER_COLLEAGUE_DEPARTMENTS,
  ['politie','brandweer','ambulance','depannage','burger']);
});

test('alleen toegankelijke personeelsdossiers staan in de selector en de link behoudt selectie',()=>{
 const html=source('public/personeelsbeheer.html');
 assert.match(html,/sortDossierColleagues\(people,BPDPersonnelVisuals\.comparePersonnel,dept\)/);
 assert.ok(html.includes("if(selected)select.value=selected.dept+':'+selected.discordId;"));
 assert.ok(html.includes("const person=people.find(p=>p.dept===dept&&"));
 assert.match(html,/window\.location\.assign\(ficheUrl\(person\)\)/);
 assert.match(source('public/dossier-colleague-sort.js'),/canOpenDossier===true/);
});

test('nevendienstselector toont alleen leden van eigen dienst, nooit andere dossiers',()=>{
 const rows=[
  entry('politie','900','Politie'),
  entry('ambulance','ARTS-03','Arts'),
  entry('brandweer','OOF12','Brandweer'),
  entry('ambulance','AMB-12','Ambulancier'),
  entry('ambulance','AMB-99','Afgeschermd',false)
 ];
 const selected=sortDossierColleagues(rows,compare,'ambulance');
 assert.deepEqual(selected.map(p=>p.call),['ARTS-03','AMB-12']);
 assert.equal(selected.some(p=>p.dept!=='ambulance'),false);
 assert.deepEqual(sortDossierColleagues(rows,compare,'onbekend'),[]);
});
