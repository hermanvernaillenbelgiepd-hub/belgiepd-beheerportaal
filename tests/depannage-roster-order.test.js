import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortDossiers,depannageCallGroup} from '../public/dossiercentrum-view.js';
import '../public/personnel-list-visuals.js';

const rows=[
 {dept:'depannage',call:'LSRA-10',rank:'—',name:'Lid 1'},
 {dept:'depannage',call:'FAST-11',rank:'—',name:'Lid 2'},
 {dept:'depannage',call:'AWV-02',rank:'—',name:'Lid 3'},
 {dept:'depannage',call:'LSRA-01',rank:'—',name:'Lid 4'},
 {dept:'depannage',call:'F.A.S.T.-01',rank:'—',name:'Lid 5'},
 {dept:'depannage',call:'DEPK-01',rank:'—',name:'Lid 6'},
 {dept:'depannage',call:'LSRA-15',rank:'Agentschap Wegen en Verkeer',name:'Lid 7'},
 {dept:'depannage',call:'ANWV-01',rank:'—',name:'Lid 8'}
];
const expected=['ANWV-01','AWV-02','LSRA-15','F.A.S.T.-01','FAST-11',
  'LSRA-01','LSRA-10','DEPK-01'];

test('Depannage uses a function order (not police grades): AWV leadership, F.A.S.T then LSRA',()=>{
 assert.deepEqual(sortDossiers(rows,'callsign-depannage').map(p=>p.call),expected);
 assert.equal(depannageCallGroup('ANWV-01').group,0);
 assert.equal(depannageCallGroup('F.A.S.T.-01').group,1);
 assert.equal(depannageCallGroup('LSRA-05').group,2);
 assert.equal(depannageCallGroup('DEPK-01').group,3);
 assert.equal(depannageCallGroup({call:'LSRA-15',rank:'Agentschap Wegen en Verkeer'}).group,0);
 assert.deepEqual(rows.map(p=>p.call).slice(0,2),['LSRA-10','FAST-11']);
});

test('Central personnel management uses the same Depannage function ordering',()=>{
 const visual=globalThis.BPDPersonnelVisuals;
 assert.deepEqual(visual.sortPersonnelRows(rows,'depannage').map(p=>p.call),expected);
 for(const person of rows){
  const a=depannageCallGroup(person),b=visual.depannageFunction(person);
  assert.equal(a.group,b.group);
  assert.equal(a.functionName,b.functionName);
 }
});

test('Depannage display has functions not grades while preserving specializations',()=>{
 const central=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
 assert.match(central,/dept==='depannage'\?'depannage':'series-desc'/);
 assert.match(central,/\['CALL','Functiegroep','Functie','Personeelslid','Reeks','Status'\]/);
 assert.match(central,/image:null/);
 assert.match(central,/depannage-groep/);
 assert.match(central,/BPDPersonnelVisuals\.specialtyColumns\(dept\)/);
 assert.match(central,/depannageSpecialtyMeta\(label\)/);
 assert.match(dossier,/option value="callsign-depannage"/);
 assert.match(dossier,/depannage\?'callsign-depannage':'callsign-bpd'/);
 assert.match(dossier,/depannageCallGroup\(r\)/);
 assert.match(dossier,/depannage\?'Functie':'Graad'/);
});

test('Ambulance, Brandweer and Police sorts are unchanged',()=>{
 const visual=globalThis.BPDPersonnelVisuals;
 const ambulance=[{call:'AMB-08'},{call:'DIRMED'},{call:'STAG-01'}];
 assert.deepEqual(visual.sortPersonnelRows(ambulance,'ambulance').map(p=>p.call),
   ['DIRMED','AMB-08','STAG-01']);
 assert.deepEqual(sortDossiers([{call:'BWM-06'},{call:'ZONE'}],'callsign-fire').map(p=>p.call),
   ['ZONE','BWM-06']);
 assert.deepEqual(sortDossiers([{call:'008'},{call:'920'},{call:'900'}],'callsign-bpd').map(p=>p.call),
   ['900','920','008']);
});
