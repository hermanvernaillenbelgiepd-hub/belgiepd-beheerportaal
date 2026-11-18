import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergePlacement,manualDisplay,validatePoliceSpecialtyEdit} from '../src/organogram-placement-policy.js';
import {policeSpecialtyName,specialtyNames,policeSpecializationBranches}
 from '../public/assets/organogram-hierarchie-model.js';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const person={dept:'politie',call:'217',name:'Voorbeeldagent',rank:'Agent van politie',
 specialties:[
  {label:'SIV/WPR',value:'Ja'},
  {label:'Signalisatie',value:'Nee'},
  {label:'Radio BM',value:'Ja'}
 ]};
test('SIV/WPR is de basiskwalificatie, niet Signalisatie',()=>{
 assert.equal(policeSpecialtyName('SIV/WPR'),'SIV/WPR');
 assert.equal(policeSpecialtyName('Signalisatie'),'SIGNALISATIE');
 const merged=mergePlacement(person,null,{specialties:[],instructorSpecialties:[],
   teacherSpecialties:[],teachingRoles:[],synced:false});
 assert.ok(merged.specialties.includes('SIV/WPR'));
 assert.ok(!merged.specialties.includes('SIGNALISATIE'));
 assert.ok(specialtyNames(merged).includes('SIV/WPR'));
 const branches=policeSpecializationBranches([merged]);
 assert.equal(branches.find(group=>group.label==='SIV/WPR').members.length,1);
 assert.equal(branches.find(group=>group.label==='SIGNALISATIE').members.length,0);
});

test('legacy SIV/WPR wordt niet stilzwijgend omgedoopt tot Signalisatie',()=>{
 const stored=manualDisplay({dept:'politie',status:'active',
  specialties:['SIV/WPR']},'politie');
 assert.deepEqual(stored.specialties,['SIV/WPR']);
 const original={specialties:['SIV/WPR'],instructorSpecialties:[],
  teacherSpecialties:[],k9Role:'',motardRole:'',dispRole:'',aeRole:'',
  reason:'Administratieve specialisatiecorrectie'};
 assert.deepEqual(validatePoliceSpecialtyEdit(original).specialties,['SIV/WPR']);
 assert.throws(()=>validatePoliceSpecialtyEdit({...original,
  instructorSpecialties:['SIV/WPR']}),/instructeur|docent/i);
});

test('specialisatiekolommen hebben leesbare labels zonder midden-in-woord afbreking',()=>{
 const html=source('public/personeelslijst.html');
 const org=source('public/organogram-hierarchie.html');
 assert.match(html,/specialty:\[108,300\]/);
 assert.match(html,/if\(item\.specialty\)return Math\.max\(108,/);
 assert.match(html,/\.mr-specialty-head>small\{[\s\S]*?white-space:nowrap!important/);
 assert.match(html,/text-overflow:ellipsis/);
 assert.match(org,/POLICE_SPECIALTIES_WITHOUT_INSTRUCTORS=new Set\(\['SIV\/WPR'/);
});
