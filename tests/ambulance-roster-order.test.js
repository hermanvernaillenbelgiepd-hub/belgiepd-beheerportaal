import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortDossiers,ambulanceCallGroup,fireCallGroup} from '../public/dossiercentrum-view.js';
import '../public/personnel-list-visuals.js';

const calls=[
  'AMB-06','HARTS-01','ARTS-04','STAG-01','HVPK-01','VPK-03',
  'DIRMED','HAMB-01','ARTS-01','AMB-02','VPK-01','AMB-10','STAG-02',
  'INCONNU','AMB-01'
];
const staff=calls.map((call,i)=>({call,dept:'ambulance',name:'Lid '+i,
  discordId:String(i),personnel:true}));

test('Official ambulance hierarchy is used in central dossier list',()=>{
 const ordered=sortDossiers(staff,'callsign-ambulance').map(x=>x.call);
 assert.deepEqual(ordered,[
  'DIRMED','HARTS-01','HVPK-01','HAMB-01',
  'ARTS-01','ARTS-04',
  'VPK-01','VPK-03',
  'AMB-01','AMB-02','AMB-06','AMB-10',
  'STAG-01','STAG-02','INCONNU'
 ]);
 assert.deepEqual(staff.map(x=>x.call),calls,'Sorting never mutates source roster');
});

test('Shared staff-management table follows same ambulance order',()=>{
 const sorted=globalThis.BPDPersonnelVisuals.sortPersonnelRows(staff,'ambulance');
 assert.deepEqual(sorted.map(x=>x.call),
  sortDossiers(staff,'callsign-ambulance').map(x=>x.call));
});

test('Ranks and UI group headings match the service sheet',()=>{
 assert.equal(ambulanceCallGroup('DIRMED').group,0);
 assert.equal(ambulanceCallGroup('HARTS-01').label,'LEIDING · DIRMED, HARTS, HVPK, HAMB');
 assert.equal(ambulanceCallGroup('HVPK-01').group,0);
 assert.equal(ambulanceCallGroup('HAMB-01').group,0);
 assert.equal(ambulanceCallGroup('ARTS-01').group,1);
 assert.equal(ambulanceCallGroup('VPK-01').group,2);
 assert.equal(ambulanceCallGroup('AMB-01').group,3);
 assert.equal(ambulanceCallGroup('STAG-01').group,4);
 assert.equal(ambulanceCallGroup('INCONNU').group,5);
});

test('Other service hierarchy and selected options remain unchanged',()=>{
 const police=[{dept:'politie',call:'008'},{dept:'politie',call:'920'},
  {dept:'politie',call:'910'}];
 assert.deepEqual(sortDossiers(police,'callsign-bpd').map(x=>x.call),
   ['910','920','008']);
 const fire=[{dept:'brandweer',call:'STAG-01'},{dept:'brandweer',call:'ZONE'}];
 assert.deepEqual(sortDossiers(fire,'callsign-fire').map(x=>x.call),['ZONE','STAG-01']);
 assert.equal(fireCallGroup('STAG-01').group,5);
});

test('Ambulance becomes default when service filter is selected',()=>{
 const central=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
 const staffUi=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(central,/option value="callsign-ambulance"/);
 assert.match(central,/ambulance\?'callsign-ambulance':'callsign-bpd'/);
 assert.match(central,/groupAmbulance=filters\.department==='ambulance'/);
 assert.match(staffUi,/dept==='ambulance'\?'ambulance':'series-desc'/);
});
