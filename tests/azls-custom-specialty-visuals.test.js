import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePersonnel,SPECIALTY_LABELS} from '../src/normalize.js';
import {mergePlacement,SPECIALTIES} from '../src/organogram-placement-policy.js';
import {registeredAzlsPatchEligible} from '../src/specialty-artwork-resolver.js';
import {validateCustomSpecialty} from '../src/specialty-role-link-routes.js';
import {allSpecialtyLabels} from '../src/specialization-policy.js';

test('AZLS Motor is removed, PIT-MOTOR remains without promoting an old sheet value',()=>{
 assert.equal(SPECIALTY_LABELS.ambulance.includes('Motor'),false);
 assert.equal(SPECIALTY_LABELS.ambulance.includes('PIT-MOTOR'),true);
 assert.equal(SPECIALTIES.ambulance.includes('Motor'),false);
 assert.equal(SPECIALTIES.ambulance.includes('PIT-MOTOR'),true);
 const header=Array(11).fill(''),line=Array(11).fill('');
 line[0]='HARTS-04';line[2]='Hoofd-Arts';line[3]='Test';line[4]='Actief';
 line[8]='Ja';line[10]='123456789012345678';
 const person=normalizePersonnel('ambulance',[header,line])[0];
 assert.equal(person.specialties.some(s=>s.label==='Motor'),false);
 assert.equal(person.specialties.some(s=>s.label==='PIT-MOTOR'),false);
 const merged=mergePlacement({
  ...person,specialties:[...person.specialties,{label:'Motor',value:'Docent'}]
 },null,{synced:false,specialties:[],instructorSpecialties:[],teacherSpecialties:[]});
 assert.equal(merged.specialties.includes('Motor'),false);
 assert.equal(merged.teacherSpecialties.includes('Motor'),false);
 const pit=mergePlacement({
  ...person,specialties:[{label:'PIT-MOTOR',value:'Ja'}]
 },null,{synced:false,specialties:[],instructorSpecialties:[],teacherSpecialties:[]});
 assert.equal(pit.specialties.includes('PIT-MOTOR'),true);
});
test('approved Andere label is saved into the same registry but only appears on a registered qualification',()=>{
 const a=validateCustomSpecialty({label:'AZLS bergredding',reason:'Nieuwe AZLS bevoegdheid gecontroleerd'},'ambulance');
 assert.equal(a.code,'azls_bergredding');
 assert.equal(a.label,'AZLS bergredding');
 assert.equal(Object.hasOwn(a,'discordRolesChanged'),false);
 for(const label of ['Motor','PIT-MOTOR','Andere','Medicatie']){
  assert.throws(()=>validateCustomSpecialty({label,reason:'Goedgekeurde eigen kwalificatie'},'ambulance'));
 }
 assert.throws(()=>validateCustomSpecialty({label:'AZLS bergredding',reason:'Geldige motivatie'},
  'ambulance',[{label:'AZLS bergredding',code:'azls_bergredding'}]));
 const merged=mergePlacement({dept:'ambulance',name:'Lid',call:'AMB-02',rank:'Ambulancier',
  specialties:[{label:'AZLS bergredding',value:'Docent'}]},
  null,{synced:false,specialties:[],instructorSpecialties:[],teacherSpecialties:[]},['AZLS bergredding']);
 assert.deepEqual(merged.specialties,['AZLS bergredding']);
 assert.deepEqual(merged.teacherSpecialties,['AZLS bergredding']);
 assert.equal(allSpecialtyLabels('ambulance',['AZLS bergredding']).includes('AZLS bergredding'),true);
});
test('selected AZLS library patch is reused for an existing HELI without inventing a role',()=>{
 const key='specialty_ambulance_mug_heli',available=new Map([[key,'/api/role-artwork/file/'+key]]);
 const link={label:'HELI',assetKey:key,roleId:'1360990813357609181',level:'Volwaardig',value:'Ja'};
 assert.equal(registeredAzlsPatchEligible('HELI',new Set(['HELI']),link,key,available),true);
 assert.equal(registeredAzlsPatchEligible('HELI',new Set(['Medicatie']),link,key,available),false);
 assert.equal(registeredAzlsPatchEligible('HELI',new Set(['HELI']),link,
  '1508506242299985980_standard',available),false);
 assert.equal(registeredAzlsPatchEligible('HELI',new Set(['HELI']),{...link,level:'In opleiding'},key,available),false);
});
test('AZLS UI offers Andere and recognizes MUG HELI and Basis TR artwork codes',()=>{
 const ui=readFileSync(new URL('../public/specialty-links-ui.js',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/specialty-role-link-routes.js',import.meta.url),'utf8');
 const organogram=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const roster=readFileSync(new URL('../public/personnel-list-visuals.js',import.meta.url),'utf8');
 assert.ok(ui.includes("['__other__','Andere – nieuwe specialisatie toevoegen']"));
 assert.ok(ui.includes("heli:['mug_heli','mugheli']"));
 assert.ok(ui.includes("basis_tr:['basis_training','basistraining','basisopleiding']"));
 assert.ok(route.includes("app.post('/api/specialty-links/:dept/custom-label'"));
 assert.ok(route.includes("db.collection(ROSTER_COLUMN_COLLECTION)"));
 assert.ok(organogram.includes('existingAzlsArtwork'));
 assert.ok(organogram.includes('registeredAzlsPatchEligible'));
 assert.ok(roster.includes("ambulance:['Basis TR','Medicatie','HELI','MIP','PIT-MOTOR']"));
 assert.ok(!roster.includes("ambulance:['Basis TR','Medicatie','HELI','Motor','MIP']"));
});
