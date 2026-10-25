import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortDossiers,fireCallGroup} from '../public/dossiercentrum-view.js';
import '../public/personnel-list-visuals.js';

const callList=[
 'BWM-25','STAG-21','OOFF-13','BWM-01','OFF-06','STAG-03','ZONE',
 'BWM-06','OOFF-08','OFF-02','BWM-05','STAG-01','HULP-01',
 'OFF-04','BWM-14','OOFF-15','OFF-03','OFF-05','BMW-07'
];
const rows=callList.map((call,i)=>({dept:'brandweer',call,name:'Lid '+i,
 discordId:String(i),personnel:true}));
const want=[
 'ZONE','OFF-02','OFF-03','OFF-04','OFF-05','OFF-06',
 'OOFF-08','OOFF-13','OOFF-15',
 'BWM-01','BWM-05','BWM-06','BMW-07','BWM-14','BWM-25',
 'STAG-01','STAG-03','STAG-21','HULP-01'
];

test('Central dossiercentrum follows official Brandweer staff hierarchy and includes trainees',()=>{
 assert.deepEqual(sortDossiers(rows,'callsign-fire').map(r=>r.call),want);
 assert.deepEqual(rows.map(r=>r.call),callList,'Source records are never mutated');
 assert.equal(fireCallGroup('ZONE').group,0);
 assert.equal(fireCallGroup('OFF-02').group,1);
 assert.equal(fireCallGroup('OOFF-08').group,2);
 assert.equal(fireCallGroup('BWM-01').group,3);
 assert.equal(fireCallGroup('BWM-06').group,4);
 assert.equal(fireCallGroup('STAG-01').group,5);
 assert.equal(fireCallGroup('STAG-21').group,5);
});

test('Central Personnel Management sorts fire calls like dossiercentrum',()=>{
 const actual=globalThis.BPDPersonnelVisuals.sortPersonnelRows(rows,'brandweer')
   .map(r=>r.call);
 assert.deepEqual(actual,want);
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(ui,/dept==='brandweer'\?'brandweer':'series-desc'/);
});

test('Brandweer group headings place all BWM calls in one Basiskader and STAG in trainees',()=>{
 const ui=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
 assert.match(ui,/groupFire\?fireCallGroup\(r\.call\)/);
 assert.match(ui,/displayedGroup=groupFire&&\(group\.group===3\|\|group\.group===4\)\?3:group\.group/);
 assert.match(ui,/BASISKADER · BWM-01 t\/m BWM-25/);
 assert.match(ui,/STAG/);
});

test('Fire ordering does not change ambulance and police sorting',()=>{
 const visual=globalThis.BPDPersonnelVisuals;
 const med=[{call:'AMB-10',dept:'ambulance'},{call:'DIRMED',dept:'ambulance'},
   {call:'STAG-02',dept:'ambulance'}];
 assert.deepEqual(visual.sortPersonnelRows(med,'ambulance').map(p=>p.call),
   ['DIRMED','AMB-10','STAG-02']);
 const police=[{call:'008',dept:'politie'},{call:'920',dept:'politie'},
   {call:'900',dept:'politie'}];
 assert.deepEqual(sortDossiers(police,'callsign-bpd').map(x=>x.call),['900','920','008']);
});
