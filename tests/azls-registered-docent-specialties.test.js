import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergePlacement,SPECIALTIES} from '../src/organogram-placement-policy.js';

const noRoles={synced:false,specialties:[],instructorSpecialties:[],teacherSpecialties:[]};
const person=specialties=>({dept:'ambulance',name:'AZLS testprofiel',
 call:'HARTS-01',rank:'Hoofd-Arts',specialties});

test('AZLS Docent is a registered qualification, not a lost specialty',()=>{
 const merged=mergePlacement(person([
  {label:'Basis TR',value:'Docent'},
  {label:'Medicatie',value:'Docent'},
  {label:'HELI',value:'Nee'},
  {label:'Motor',value:'Docent'},
  {label:'MIP',value:'Ja'}
 ]),null,noRoles);
 assert.equal(merged.rank,'Hoofd-Arts');
 assert.equal(merged.call,'HARTS-01');
 assert.ok(SPECIALTIES.ambulance.includes('Motor'));
 assert.deepEqual([...merged.specialties].sort(),['Basis TR','Medicatie','Motor','MIP'].sort());
 assert.deepEqual([...merged.teacherSpecialties].sort(),['Basis TR','Medicatie','Motor'].sort());
 assert.deepEqual(merged.instructorSpecialties,[]);
 assert.ok(!merged.specialties.includes('HELI'));
});

test('AZLS Instructeur is retained without changing ranks or granting Discord rights',()=>{
 const merged=mergePlacement(person([
  {label:'Medicatie',value:'INSTRUCTEUR'},
  {label:'MIP',value:'RESTRICTED'},
  {label:'HELI',value:'Nee'}
 ]),null,noRoles);
 assert.deepEqual(merged.specialties,['Medicatie']);
 assert.deepEqual(merged.instructorSpecialties,['Medicatie']);
 assert.deepEqual(merged.teacherSpecialties,[]);
 assert.equal(Object.hasOwn(merged,'roleIds'),false);
 assert.equal(Object.hasOwn(merged,'permissions'),false);
});

test('AZLS public profile shows an existing teacher/instructor qualification label',()=>{
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(html,/p\.dept==='ambulance'\?\[/);
 assert.match(html,/p\.teacherSpecialties\.includes\(name\)\?\['docent'\]/);
 assert.match(html,/p\.instructorSpecialties\.includes\(name\)\?\['instructeur'\]/);
});
