import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePoliceSpecialtyEdit} from '../src/organogram-placement-policy.js';

const source=(extra={})=>({
 specialties:['AE','RADIO/BM'],instructorSpecialties:[],
 teacherSpecialties:[],k9Role:'',motardRole:'',dispRole:'',
 reason:'Geverifieerde of manuele AE-functie controleren',...extra
});

test('authorized officer may manually register AE Teamleader as display-only',()=>{
 const values=validatePoliceSpecialtyEdit(source({aeRole:'teamleader'}));
 assert.equal(values.aeRole,'teamleader');
 assert.ok(values.specialties.includes('AE'));
 assert.equal(validatePoliceSpecialtyEdit(source()).aeRole,'');
 assert.throws(()=>validatePoliceSpecialtyEdit(source({
  specialties:['RADIO/BM'],aeRole:'teamleader'
 })),/AE-lidmaatschap/);
 assert.throws(()=>validatePoliceSpecialtyEdit(source({aeRole:'administrator'})),/Ongeldige AE-functie/);
 assert.throws(()=>validatePoliceSpecialtyEdit(source({aeRole:'instructeur'})),/instructeursselectie/);
 assert.equal(validatePoliceSpecialtyEdit(source({
  instructorSpecialties:['AE'],aeRole:'instructeur'
 })).aeRole,'instructeur');
});

test('AE manual display is audited and does not update Discord or access rights',()=>{
 const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(route,/AE_MANUAL_DISPLAY_COLLECTION='bpd_ae_display_roles'/);
 assert.match(route,/action:'ae_display_role'/);
 assert.match(route,/if\(!canEditK9Display\(req\.bpd\)\)/);
 assert.match(route,/values\.aeRole/);
 assert.match(route,/tx\.set\(aeRef,\{dept:'politie'/);
 assert.match(route,/if\(AE_MANUAL_LEVELS\.has\(chosenAE\)\)/);
 assert.match(html,/id="police-ae-role"/);
 assert.match(html,/value="teamleader">TEAMLEADER \/ LEIDING/);
 assert.match(html,/aeManual:/);
 assert.match(html,/person\.aeManual=aeRole/);
 assert.match(html,/roleProof\.status/);
 assert.match(html,/radio-bm-text-patch/);
 assert.match(html,/RADIO\/BM — neutrale tekstplaat/);
});

test('read-only live role check no longer rejects an otherwise identifiable roster member because Sheets is stale',()=>{
 const route=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const check=route.split("app.get('/api/organogram/specialty-check/:dept/:call'")[1]
  ?.split('// K9 role editing')[0]||'';
 assert.ok(check.includes('targets.length!==1'));
 assert.ok(check.includes('verifyLiveSpecialtyRoles(staff.personId)'));
 assert.ok(!check.includes('if(snapshot.stale)'));
});
