import test from 'node:test';
import assert from 'node:assert/strict';
import {roleForDepartment} from '../src/leave-policy.js';
import {canEditPersonnel,canViewPersonnel} from '../src/personnel-editor-policy.js';
import {canCreatePersonnel} from '../src/personnel-create.js';
import {mayReadManagement,mayWriteManagement,mayExportWeekReport} from '../src/management-utils.js';
import {maySubmit,mayAmend,canChooseSanction} from '../src/registrations.js';
import {readFileSync} from 'node:fs';

const chiefId='111111111111111111',target='222222222222222222';
const chief={uid:'discord:'+chiefId,discordId:chiefId,role:'basiskader',
  departments:['brandweer'],departmentRoles:{brandweer:'basiskader'},
  dossierNativeDepartments:['brandweer'],dossierAllowedDepartments:['brandweer'],
  fireZoneChief:true};
const person={dept:'brandweer',personId:target,name:'Collega',call:'BW-22',rank:'Brandweerman'};
test('Verified ZONE chief can fully maintain Fire personnel, reports and sanctions',()=>{
  assert.equal(roleForDepartment(chief,'brandweer'),'korpsleiding');
  assert.equal(canViewPersonnel(chief,'brandweer'),true);
  assert.equal(canEditPersonnel(chief,person),true);
  assert.equal(canEditPersonnel(chief,{...person,personId:chiefId}),false);
  assert.equal(canCreatePersonnel(chief,'brandweer'),true);
  assert.equal(mayReadManagement(chief,'brandweer'),true);
  for(const kind of ['notitie','opleiding','naamswijziging','personeelsbeweging','activiteit'])
    assert.equal(mayWriteManagement(chief,'brandweer',kind),true);
  assert.equal(mayExportWeekReport(chief,'brandweer'),true);
  assert.equal(maySubmit(chief,'observatie','brandweer'),true);
  assert.equal(maySubmit(chief,'sanctie','brandweer'),true);
  assert.equal(mayAmend(chief,'sanctie','brandweer'),true);
  assert.equal(canChooseSanction('korpsleiding','Ontslag'),true);
});
test('ZONE privilege cannot confer police, ambulance or towing management',()=>{
  for(const dept of ['politie','ambulance','depannage']){
    assert.equal(roleForDepartment(chief,dept),null);
    assert.equal(canViewPersonnel(chief,dept),false);
    assert.equal(canCreatePersonnel(chief,dept),false);
    assert.equal(mayReadManagement(chief,dept),false);
    assert.equal(mayWriteManagement(chief,dept,'notitie'),false);
    assert.equal(maySubmit(chief,'sanctie',dept),false);
    assert.equal(mayAmend(chief,'sanctie',dept),false);
  }
  const bogus={...chief,fireZoneChief:false};
  assert.equal(canEditPersonnel(bogus,person),false);
  assert.equal(maySubmit(bogus,'sanctie','brandweer'),false);
  assert.equal(mayAmend(bogus,'sanctie','brandweer'),false);
});
test('ZONE access is set only by protected dossier middleware and displayed as server capability',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
  assert.ok(server.includes('req.bpd.fireZoneChief=verifiedFireZoneChief('));
  assert.ok(editor.includes("app.get('/api/personnel/overview',requireDossierUser"));
  assert.ok(editor.includes("app.post('/api/personnel/:dept/:discordId',requireDossierUser"));
  assert.ok(routes.includes('fireZoneChief:req.bpd.fireZoneChief===true'));
  assert.ok(routes.includes('heavySanctionDepartments'));
  assert.ok(ui.includes("const canSanction=dept=>Boolean(userState?.sanctionDepartments?.includes(dept))"));
  assert.ok(ui.includes("canHeavy($('dept').value)"));
});
