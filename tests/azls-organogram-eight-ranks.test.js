import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AZLS_RANK_ORDER,SERVICES,getTier,ambulanceOrganogramRank,serviceHierarchy}
 from '../public/assets/organogram-hierarchie-model.js';
import {LEADERSHIP_LEVELS,validatePlacement} from '../src/organogram-placement-policy.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const order=['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','STAG'];
const rows=[
 ['DIRMED','Medisch directeur','DIRMED'],['HARTS-01','Hoofd-Arts','HARTS'],
 ['HVPK-01','Hoofd-Verpleegkundige','HVPK'],
 ['HAMB-01','Hoofd-Ambulancier','HAMB'],['ARTS-01','Arts','ARTS'],
 ['VPK-01','Verpleegkundige','VPK'],['AMB-01','Ambulancier','AMB'],
 ['STAG-01','Stagiair','STAG']
];
const people=rows.map(([call,rank],i)=>({
 dept:'ambulance',call,rank,name:'Persoon '+i,
 specialties:i%2?['PIT']:[],teachingRoles:[],displayOrder:0
}));
test('AZLS official rank order is consistent between organogram and visual placement validator',()=>{
 assert.deepEqual([...AZLS_RANK_ORDER],order);
 assert.deepEqual(SERVICES.find(x=>x.id==='ambulance').levels,AZLS_RANK_ORDER);
 assert.deepEqual(LEADERSHIP_LEVELS.ambulance,order);
});
test('DIRMED/HARTS/HVPK/HAMB/ARTS/VPK/AMB/STAG each have their own group in rank order',()=>{
 for(let i=0;i<rows.length;i++){
  assert.equal(ambulanceOrganogramRank(people[i]),rows[i][2]);
  assert.equal(getTier(people[i]),rows[i][2]);
 }
 const tree=serviceHierarchy(people,'ambulance');
 assert.deepEqual(tree.leadership.map(x=>x.label),order);
 assert.deepEqual(tree.leadership.map(x=>x.members.length),order.map(()=>1));
 assert.deepEqual(tree.leadership.map(x=>x.members[0].call),rows.map(x=>x[0]));
 assert.equal(tree.count,8);
});
test('exact prefix prevents HARTS from being sorted as ARTS and HVPK as VPK',()=>{
 for(const [call,expected]of [
  ['DIR-MED-01','DIRMED'],['HARTS-03','HARTS'],['HVPK-03','HVPK'],
  ['HAMB-02','HAMB'],['ARTS-03','ARTS'],['VPK-02','VPK'],
  ['AMB-04','AMB'],['STAG-03','STAG']
 ]){
  assert.equal(getTier({dept:'ambulance',call,rank:'Lid'}),expected);
 }
 for(const [rank,expected] of [
  ['Directeur','DIRMED'],['Hoofd-Arts','HARTS'],
  ['Hoofd-Verpleegkundige','HVPK'],['Hoofd-Ambulancier','HAMB'],
  ['Arts','ARTS'],['Verpleegkundige','VPK'],['Ambulancier','AMB'],
  ['Stagiair','STAG']]){
  assert.equal(getTier({dept:'ambulance',rank,call:''}),expected);
 }
});
test('unknown or historic AZLS calls are kept visible without inventing a rank',()=>{
 const old={dept:'ambulance',name:'Historisch lid',call:'AZLS-01',rank:'AZLS leiding',
  leadershipTier:'AZLS-leiding'};
 assert.equal(getTier(old),'Overige AZLS-leden');
 const tree=serviceHierarchy([...people,old],'ambulance');
 assert.equal(tree.leadership[8].label,'Overige AZLS-leden');
 assert.deepEqual(tree.leadership[8].members.map(x=>x.call),['AZLS-01']);
 assert.equal(tree.count,9);
});
test('ambulance speciality membership is still listed below the rank structure',()=>{
 const tree=serviceHierarchy(people,'ambulance');
 const names=tree.branches.map(x=>x.label);
 assert.ok(names.includes('PIT'));
 assert.ok(names.includes('Overige leden (geen geregistreerde specialisatie)'));
 assert.equal(tree.branches.find(x=>x.label==='PIT').members.length,4);
 assert.equal(tree.branches.find(x=>x.label.startsWith('Overige leden')).members.length,4);
});
test('empty AZLS levels are folded in compact rows and non-medical services retain their own tree',()=>{
 assert.match(html,/RANGSTRUCTUUR · AZLS/);
 assert.match(html,/settings\.id!=='ambulance'\|\|level\.members\.length>0/);
 assert.match(html,/settings\.id!=='ambulance'\)levelBody\.append/);
 for(const dept of ['politie','brandweer','depannage']){
  assert.ok(SERVICES.find(s=>s.id===dept).levels.length>0);
 }
});
test('display-only placement values do not change any operational permissions',()=>{
 const valid={
  boardRole:'none',leadershipTier:'HVPK',displayOrder:0,
  teachingRoles:[],displayLabels:[],specialties:[],
  instructorSpecialties:[],teacherSpecialties:[],
  reason:'Alleen de visuele AZLS-indeling aangepast'
 };
 assert.equal(validatePlacement(valid,'ambulance').leadershipTier,'HVPK');
 assert.throws(()=>validatePlacement({...valid,leadershipTier:'Medische coördinatie'},'ambulance'));
});
