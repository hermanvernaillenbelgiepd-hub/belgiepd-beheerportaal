import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hierarchy,serviceHierarchy,getTier,orderedMembers,isTeacher,specialtyNames,SERVICES} from '../public/assets/organogram-hierarchie-model.js';

const sample=[
 {dept:'politie',name:'K',call:'900',rank:'Eerste hoofdcommissaris'},
 {dept:'politie',name:'O',call:'920',rank:'Commissaris'},
 {dept:'politie',name:'M',call:'700',rank:'Hoofdinspecteur'},
 {dept:'politie',name:'Lid',call:'750',rank:'Hoofdinspecteur',specialties:['Motard']},
 {dept:'politie',name:'Docent',call:'400',rank:'Inspecteur',teachingRoles:['docent'],specialties:['Motard','Dispatch']},
 {dept:'politie',name:'Instructeur',call:'500',rank:'Eerste inspecteur',teachingRoles:['instructeur'],specialties:['Motard']},
 {dept:'brandweer',name:'BW chef',call:'ZONE',rank:'Zonecommandant'},
 {dept:'brandweer',name:'BW ploeg',call:'BWM-10',rank:'Brandweerman',specialties:[{label:'Duiker',value:'Ja'}]},
 {dept:'ambulance',name:'AZLS chef',call:'AZLS-01',rank:'AZLS Leiding'},
 {dept:'depannage',name:'AWV chef',call:'AWV-01',rank:'Agentschap Wegen en Verkeer leiding'},
 {dept:'burger',name:'Burgerraad',call:'BR-01',rank:'Burgerraad'}
];
test('Bestuur has exactly five child service branches, in the agreed order',()=>{
 const h=hierarchy(sample);
 assert.deepEqual(h.map(s=>s.dept),['politie','brandweer','ambulance','depannage','burger']);
 assert.deepEqual(SERVICES[0].levels,['Korpsleiding','Officierenkader','Middenkader']);
 assert.deepEqual(SERVICES[1].levels,['Zoneleiding','Officieren','Middenkader']);
 assert.equal(h[4].leadership[0].label,'Burgerraad');
});
test('police leadership precedes specializations and rank sorting within teacher group',()=>{
 const p=serviceHierarchy(sample,'politie');
 assert.deepEqual(p.leadership.map(l=>l.members.map(p=>p.call)),[['900'],['920'],['700','750']]);
 const motard=p.branches.find(s=>s.label==='MOTARD');
 assert.ok(motard);
 assert.deepEqual(motard.members.map(m=>m.call),['500','400','750']);
 assert.equal(isTeacher(motard.members[0]),true);
 assert.equal(isTeacher(motard.members[1]),true);
 assert.equal(isTeacher(motard.members[2]),false);
 const dispatch=p.branches.find(s=>s.label==='DISP');
 assert.deepEqual(dispatch.members.map(m=>m.call),['400']);
});
test('police specialties follow the explicitly agreed hierarchy and RADIO/BM is under INTERVENTIEDIENST',()=>{
 const p=serviceHierarchy([
  ...sample,
  {dept:'politie',name:'Radio lid',call:'310',rank:'Aspirant inspecteur',
   specialties:['Radio BM']},
  {dept:'politie',name:'Rechercher',call:'670',rank:'Aspirant hoofdinspecteur',
   specialties:['Lokale Recherche']}
 ],'politie');
 assert.deepEqual(p.branches.slice(0,10).map(s=>s.label),[
  'INTERVENTIEDIENST','SIGNALISATIE','MOTARD','SEMI ANONIEM','K9',
  'RAGO','DISP','TO','AE','RECHERCHE'
 ]);
 assert.equal(p.branches[0].children[0].label,'RADIO/BM');
 assert.deepEqual(p.branches[0].children[0].members.map(p=>p.call),['310']);
 assert.deepEqual(p.branches[9].members.map(p=>p.call),['670']);
 assert.equal(p.branches.some(s=>s.label==='Radio BM'),false);
 assert.equal(p.branches.some(s=>s.label==='Dispatch'),false);
});
test('legacy aliases map to the new categories without losing specializations',()=>{
 const p=serviceHierarchy([
  {dept:'politie',name:'A',call:'350',specialties:['Motor','SIV/WPR','Dispatch']},
  {dept:'politie',name:'B',call:'450',specialties:['K-9','Semi-anonieme','Terreinondersteuner']},
  {dept:'politie',name:'C',call:'500',specialties:['AE-T','RAGO']},
  {dept:'politie',name:'D',call:'600',specialties:['EHBO']},
  {dept:'politie',name:'E',call:'700',specialties:['Motor','Motard']}
 ],'politie');
 const labels=['SIGNALISATIE','MOTARD','SEMI ANONIEM','K9','RAGO','DISP','TO','AE'];
 for(const label of labels)assert.ok(p.branches.some(x=>x.label===label&&x.members.length),label);
 assert.deepEqual(p.branches.find(x=>x.label==='MOTARD').members.map(x=>x.call),['700','350']);
 assert.ok(p.branches.some(x=>x.label==='Overige specialisaties'&&x.children.some(c=>c.label==='EHBO')));
});
test('an ordinary 700 never jumps ahead of a lower-rank authorized instructor',()=>{
 const p=orderedMembers(sample.filter(s=>s.dept==='politie'&&['700','400','500'].includes(s.call)));
 assert.deepEqual(p.map(x=>x.call),['500','400','700']);
});
test('the same name in several services remains separately represented',()=>{
 const sharedName=[
  {dept:'politie',name:'Zelfde Naam',call:'700',rank:'Hoofdinspecteur'},
  {dept:'brandweer',name:'Zelfde Naam',call:'OOFF-08',rank:'Adjudant'}
 ];
 const h=hierarchy(sharedName);
 assert.equal(h[0].count,1);
 assert.equal(h[1].count,1);
 assert.notEqual(h[0].leadership[2].members[0],h[1].leadership[2].members[0]);
});
test('unknown roles cannot confer teaching status, only explicitly confirmed metadata can',()=>{
 assert.equal(isTeacher({name:'Instructeur X',rank:'Instructeur',call:'400'}),false);
 assert.equal(isTeacher({teachingRoles:['DOCENT']}),true);
 assert.equal(isTeacher({teachingRoles:['Instructeur']}),true);
 assert.equal(isTeacher({teachingRoles:['bestuur','member']}),false);
 assert.deepEqual(specialtyNames({specialties:[{label:'Duiker',value:'Nee'},'Motard: Ja',{label:'K9',value:'Ja'},'Middenkader']}),['Motard','K9']);
});
test('the new TEST page has no form to mutate personnel and distinguishes demo vs real data',()=>{
 const s=readFileSync(new URL('../public/organogram-hierarchie-proef.html',import.meta.url),'utf8');
 assert.match(s,/<strong>👑 BESTUUR<\/strong>/);
 assert.match(s,/SERVICES,hierarchy,orderedMembers,isTeacher,specialtyNames/);
 assert.match(s,/api\/dossiercentrum\/public-roster/);
 assert.match(s,/Voorbeeldgegevens/);
 assert.match(s,/Burgerraad en burgers blijven onder Bestuur/);
 assert.match(s,/teachingRoles:\[\]/);
 assert.doesNotMatch(s,/\bfetch\([^)]*method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});

test('handmatig leidingniveau beïnvloedt uitsluitend de gekozen diensttak',()=>{
 assert.equal(getTier({dept:'politie',call:'450',rank:'Inspecteur',
  leadershipTier:'Middenkader'}),'Middenkader');
 assert.equal(getTier({dept:'ambulance',call:'VPK-01',rank:'Verpleegkundige',
  leadershipTier:'Middenkader'}),'Zorgteams');
 assert.equal(getTier({dept:'politie',call:'450',rank:'Inspecteur',
  leadershipTier:'none'}),'Basiskader');
});
