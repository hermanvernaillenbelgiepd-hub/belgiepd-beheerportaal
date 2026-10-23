import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');
test('Eén registratieselectie voor alle toegestane dossiercategorieën',()=>{
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new Script(code.replace(/^import [^\n]*\n/gm,'')));
 for(const key of ['registrationKind','registrationFields','registrationSubmit'])
  assert.match(html,new RegExp('id="'+key+'"'));
 for(const form of ['staffFormalForm','staffCaseForm','staffTrainingForm',
  'staffManualLeaveForm','specialtyEdit','functionChangeForm'])
  assert.equal([...html.matchAll(new RegExp('id="'+form+'"','g'))].length,1);
 assert.match(html,/\$\('registrationFields'\)\.append\(\$\(formId\)\)/);
 assert.match(html,/\$\('registrationKind'\)\.onchange=/);
 assert.match(html,/\$\('formalType'\)\.closest\('div'\)\.hidden=true/);
 assert.match(html,/\$\('staffCaseType'\)\.closest\('div'\)\.hidden=true/);
 assert.match(css,/\.registration-hub-fields>form button\[type="submit"\]\{display:none!important\}/);
});
test('Keuzelijst is gebaseerd op serverbevestigde schrijfrechten per dienst',()=>{
 const required=[
   'formalPermissions?.writesEnabled===true&&formalPermissions.actor',
   'formalPermissions.observationDepartments?.includes(dept)',
   'formalPermissions.sanctionDepartments?.includes(dept)',
   'casePermissions?.writesEnabled===true&&casePermissions.actor',
   'casePermissions.typesByDepartment?.[dept]||[]',
   'trainingRights?.trainingWritesEnabled===true',
   'trainingRights.permissions?.[dept]?.[\'training.log\']===true',
   'registrationManualLeave','registrationSpecialty','functionCanEdit',
   'availablePersonnelRegistrationKinds().some(([key])=>key===kind)'
 ];
 for(const token of required)assert.ok(html.includes(token),token);
 assert.match(html,/function submitSelectedRegistration\(/);
 assert.match(html,/form\.requestSubmit\(\)/);
 assert.match(html,/if\(registrationSaving\|\|form\.hidden/);
 assert.match(html,/await originalSubmit\.call\(form,event\)/);
});
test('Schrijven blijft in oorspronkelijke geauditeerde register-/rapport-API',()=>{
 for(const path of ['/api/registrations','/api/management/cases','/api/training',
  '/api/leave/manual','/specializations','/functions']){
   assert.ok(html.includes(path),path);
 }
 assert.ok(html.includes('weekrapport'));
 assert.ok(html.includes('verlofaanvraag')||html.includes('verlofperiode'));
 assert.match(html,/type==='verlof'\?'Verlofnotitie \(geen verlofaanvraag\)'/);
});
