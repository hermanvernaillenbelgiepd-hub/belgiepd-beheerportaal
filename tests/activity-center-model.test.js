import test from 'node:test';
import assert from 'node:assert/strict';
import {belgianDate,activitySheetRows,activityAssessment,activityOverview} from '../src/activity-center-model.js';
test('validates Belgian sheet dates and rejects impossible dates',()=>{
 assert.equal(belgianDate('03/11/2026'),'2026-11-03');
 assert.equal(belgianDate('31/02/2026'),null);
});
test('evaluates 14, 30 and 60 days without taking any action',()=>{
 const base={lastCheck:'2026-11-03',sourceStatus:'Actief'};
 for(const [last,kind] of [['2026-10-20','50/50'],['2026-10-04','inactief'],['2026-09-04','beoordelen']]){
  assert.equal(activityAssessment({...base,lastConnection:last},'2026-11-03').kind,kind);
 }
 assert.equal(activityAssessment({...base,lastConnection:'2026-10-01',sourceStatus:'Verlof'},'2026-11-03').kind,'verlof_nazien');
 assert.equal(activityAssessment({...base,lastConnection:'2026-10-01',lastCheck:'2026-10-30'},'2026-11-03').kind,'verouderd');
});
test('cross-links by Discord ID and discards duplicate/ambiguous spreadsheet identities',()=>{
 const header=Array(26).fill('');header[4]='Discord ID';
 const a=Array(26).fill('');a[4]='123456789012345678';a[6]='20/10/2026';a[7]='03/11/2026';a[18]='6';
 const r=activityOverview([{personId:a[4],dept:'politie',call:'300',name:'Test',status:'Actief'}],[header,a],'2026-11-03');
 assert.equal(r.people[0].kind,'50/50');assert.equal(r.people[0].periodPlayHours,6);
 const d=activitySheetRows([header,a,a]);assert.equal(d.items.size,0);assert.equal(d.duplicates,1);
});
