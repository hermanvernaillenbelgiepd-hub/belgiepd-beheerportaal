import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalPoliceSpecialty,groupPoliceSeries,groupPoliceSpecialties,
 policeSpecialtyTier} from '../public/personnel-grouping-policy.js';
const root=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const person=(name,call,specialties=[],others={})=>({
 dept:'politie',name,call,rank:'Inspecteur',series:'1',specialties,
 instructorSpecialties:[],teacherSpecialties:[],specialtyPatches:[],...others
});
test('series preserve distinct leadership, assigned numbers, Vlinder and kader',()=>{
 const people=[person('A','700',[],{series:'1',reekshoofdReeks:'Reeks 1'}),
 person('B','200',[],{series:'Reeks 1'}),
 person('C','610',[],{series:'VLINDER',reekshoofdReeks:'VLINDER'}),
 person('D','910',[],{rank:'Eerste commissaris',series:'KADER'}),
 person('E','320',[],{series:'2'}),
 person('F','330',[],{series:'3'}),
 person('G','340',[],{series:'4'})];
 const groups=groupPoliceSeries(people);
 assert.deepEqual(groups.slice(0,4).map(x=>x.total),[2,1,1,1]);
 assert.deepEqual(groups[0].heads.map(x=>x.name),['A']);
 assert.deepEqual(groups[0].members.map(x=>x.name),['B']);
 assert.equal(groups.find(x=>x.key==='vlinder').total,1);
 assert.equal(groups.find(x=>x.key==='kader').total,1);
 assert.equal(groups.reduce((n,x)=>n+x.total,0),people.length);
});
test('specializations are based on existing roles, no inferred membership or invented trainees',()=>{
 const people=[
  person('K9 in stage','202',['K9'],{k9Role:'geleider_in_stage'}),
  person('K9 instructor','650',['K9'],{k9Role:'instructeur'}),
  person('K9 handler','450',['K9'],{k9Role:'geleider'}),
  person('AE leader','910',['AE'],{aeRoles:['instructeur','teamleader'],aeTeamleader:true}),
  person('AE instructor','920',['AE'],{aeRoles:['instructeur']}),
  person('AE trainee','201',['AE'],{aeRoles:['ae_i']}),
  person('AE full','700',['AE'],{aeRoles:['ae_t']}),
  person('RAGO student','410',['RAGO-IO']),
  person('Motard trainee','430',['Motor'],{motardRole:'in_opleiding'}),
  person('Unassigned','499',[])
 ];
 const data=groupPoliceSpecialties(people);
 const k9=data.find(x=>x.key==='K9'),ae=data.find(x=>x.key==='AE'),
  rago=data.find(x=>x.key==='RAGO'),mot=data.find(x=>x.key==='MOTARD');
 assert.equal(k9.total,3);assert.deepEqual(k9.groups.trainees.map(x=>x.name),['K9 in stage']);
 assert.deepEqual(k9.groups.instructors.map(x=>x.name),['K9 instructor']);
 assert.deepEqual(ae.groups.leadership.map(x=>x.name),['AE leader']);
 assert.deepEqual(ae.groups.instructors.map(x=>x.name),['AE instructor']);
 assert.deepEqual(ae.groups.trainees.map(x=>x.name),['AE trainee']);
 assert.deepEqual(ae.groups.members.map(x=>x.name),['AE full']);
 assert.deepEqual(rago.groups.trainees.map(x=>x.name),['RAGO student']);
 assert.deepEqual(mot.groups.trainees.map(x=>x.name),['Motard trainee']);
 assert.equal(data.find(x=>x.key==='TO').total,0);
});
test('aliases are stable and unknown specialties remain separate',()=>{
 assert.equal(canonicalPoliceSpecialty('AE-I'),'AE');
 assert.equal(canonicalPoliceSpecialty('SIV/WPR'),'SIV/WPR');
 assert.equal(canonicalPoliceSpecialty('RAGO-IO'),'RAGO');
 assert.equal(canonicalPoliceSpecialty('Radio BM'),'RADIO/BM');
 assert.equal(canonicalPoliceSpecialty('Terreinondersteuner'),'TO');
 assert.equal(canonicalPoliceSpecialty('INTERVENTIEDIENST'),'INTERVENTIEDIENST');
 const data=groupPoliceSpecialties([person('X','300',['WATERTEAM'])]);
 assert.equal(data.find(x=>x.key==='WATERTEAM').total,1);
});
test('read-only UI and API projection do not grant dossier access or expose identities',()=>{
 const management=root('public/personeelsbeheer.html'),
   page=root('public/personnel-grouped-ui.js'),
   api=root('src/organogram-placement-routes.js'),
   docker=root('Dockerfile');
 assert.match(management,/id="personnelSeriesTab"/);
 assert.match(management,/id="personnelSpecialtiesTab"/);
 assert.match(management,/id="personnelGroupedView"/);
 assert.match(page,/groupPoliceSeries/);assert.match(page,/groupPoliceSpecialties/);
 assert.match(page,/openPerson\(p\\.call,p\\.name\\)/);
 assert.match(api,/series:p\\.dept==='politie'/);
 assert.match(docker,/tests\/personnel-grouping-policy\.test\.js/);
});
