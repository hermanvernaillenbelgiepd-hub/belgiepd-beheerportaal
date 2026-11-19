import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierEventDay,compareDossierEntriesNewestFirst,newestDossierEntries}
 from '../public/dossier-entry-order.js';
import {defaultPersonnelGroupOpen} from '../public/personnel-grouped-ui.js';

test('observaties staan op werkelijke gebeurtenisdatum, nieuw naar oud',()=>{
 const dec={id:'dec',type:'observatie',eventDate:'24/12/2025',
  createdAt:'2026-11-19T19:00:00Z'};
 const june14={id:'june14',type:'observatie',eventDate:'14/06/2026',
  createdAt:'2026-06-14T10:00:00Z'};
 const june7={id:'june7',type:'observatie',eventDate:'07/06/2026',
  createdAt:'2026-06-07T15:00:00Z'};
 const original=[dec,june7,june14];
 assert.deepEqual(newestDossierEntries(original).map(x=>x.id),
  ['june14','june7','dec']);
 assert.deepEqual(original.map(x=>x.id),['dec','june7','june14'],
  'Only reorder the displayed view, never change stored records');
});
test('Belgische en ISO datumformaten geven dezelfde chronologische volgorde',()=>{
 assert.equal(dossierEventDay('19/11/2026'),'2026-11-19');
 assert.equal(dossierEventDay('2026-11-19'),'2026-11-19');
 assert.equal(dossierEventDay('2026-11-19T20:45:00Z'),'2026-11-19');
 assert.equal(dossierEventDay('31/02/2026'),'');
 assert.equal(dossierEventDay('geen datum'),'');
 assert.deepEqual(newestDossierEntries([
  {id:'a',eventDate:'2026-02-09'},
  {id:'b',eventDate:'10/02/2026'},
  {id:'c',eventDate:'2025-12-24'}
 ]).map(x=>x.id),['b','a','c']);
});
test('gelijke gebeurtenisdatum gebruikt gebeurtenistijd en registratietijd als tweede criterium',()=>{
 const a={id:'a',eventDate:'2026-11-19',eventTime:'10:00',
  createdAt:'2026-11-19T21:00:00Z'};
 const b={id:'b',eventDate:'2026-11-19',eventTime:'11:00',
  createdAt:'2026-11-19T11:05:00Z'};
 assert.ok(compareDossierEntriesNewestFirst(b,a)<0);
 const c={id:'c',eventDate:'2026-11-19',createdAt:'2026-11-19T08:00:00Z'};
 const d={id:'d',eventDate:'2026-11-19',createdAt:'2026-11-19T09:00:00Z'};
 assert.ok(compareDossierEntriesNewestFirst(d,c)<0);
});
test('zonder gebeurtenisdatum gebruikt de bestaande registratiedatum, onbekend blijft onderaan',()=>{
 const rows=newestDossierEntries([
  {id:'unknown'},
  {id:'created',createdAt:'2026-04-15T19:00:00Z'},
  {id:'legacy',_noteSortDate:'23/06/2026'},
  {id:'older',recordedAt:'2025-03-01T19:00:00Z'}
 ]);
 assert.deepEqual(rows.map(x=>x.id),['legacy','created','older','unknown']);
});
test('bij openen: Reeks 1 en 2 uitgevouwen; Reeks 3 ingeklapt',()=>{
 assert.equal(defaultPersonnelGroupOpen('reeksen','politie','1'),true);
 assert.equal(defaultPersonnelGroupOpen('reeksen','politie','2'),true);
 assert.equal(defaultPersonnelGroupOpen('reeksen','politie','3'),false);
 assert.equal(defaultPersonnelGroupOpen('reeksen','politie','4'),false);
});
test('bij openen: alleen politie Motard en K9 uitgevouwen, alle andere specialisaties dicht',()=>{
 for(const label of ['MOTARD','Motard','MOTOR','K9','K-9']){
  assert.equal(defaultPersonnelGroupOpen('specialisaties','politie',label),true,label);
 }
 for(const label of ['AE','DISP','DISPATCH','RAGO','TO','SIV/WPR','SIGNALISATIE']){
  assert.equal(defaultPersonnelGroupOpen('specialisaties','politie',label),false,label);
 }
 assert.equal(defaultPersonnelGroupOpen('specialisaties','brandweer','MOTARD'),false);
 assert.equal(defaultPersonnelGroupOpen('specialisaties','ambulance','K9'),false);
});
test('groepspagina en dossierweergave gebruiken de expliciete standaard en datumsortering',()=>{
 const grouped=readFileSync(new URL('../public/personnel-grouped-ui.js',import.meta.url),'utf8');
 assert.match(grouped,/defaultPersonnelGroupOpen\(mode,scoped,g\.key\)/);
 assert.match(grouped,/groupOpen\.set\(openKey,item\.open\)/);
 assert.doesNotMatch(grouped,/item\.open=index<2/);
 const dossier=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(dossier,/const cases=newestDossierEntries\(entries\)/);
 assert.match(dossier,/const list=newestDossierEntries\(entries\)/);
 assert.match(dossier,/const records=newestDossierEntries\(/);
 assert.match(dossier,/newestDossierEntries\(\[\.\.\.generalCaseEntries,\.\.\.generalLegacyEntries\]\)/);
});
