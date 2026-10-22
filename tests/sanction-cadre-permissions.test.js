import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canChooseSanction,permittedSanctionTypes,HEAVY_SANCTION_TYPES,mayAmend,maySubmit} from '../src/registrations.js';
import {roleForDepartment} from '../src/leave-policy.js';

const officer=(role,dept='politie')=>({
  role,departments:[dept],departmentRoles:{[dept]:role},
  dossierNativeDepartments:[dept],discordId:'111111111111111111'
});
const three=['Mondelinge waarschuwing','Officiële waarschuwing','Tijdelijke beperking'];
const proposal='Voorstel tot degradatie';

test('Middenkader: drie lichte sancties; degradatievoorstel alleen bij ernst 9 of 10',()=>{
  const actor=officer('middenkader');
  assert.equal(maySubmit(actor,'sanctie','politie'),true);
  assert.equal(roleForDepartment(actor,'politie'),'middenkader');
  assert.deepEqual(permittedSanctionTypes('middenkader',8),three);
  assert.deepEqual(permittedSanctionTypes('middenkader',9),[...three,proposal]);
  assert.deepEqual(permittedSanctionTypes('middenkader',10),[...three,proposal]);
  assert.equal(canChooseSanction('middenkader',proposal,8),false);
  assert.equal(canChooseSanction('middenkader',proposal,9),true);
  assert.equal(canChooseSanction('middenkader',proposal,10),true);
  assert.equal(canChooseSanction('middenkader',proposal,undefined),false);
});
test('Officierenkader kan degraderen en schorsen; alleen Korpsleiding kan ontslaan',()=>{
  for(const kind of HEAVY_SANCTION_TYPES){
    assert.equal(canChooseSanction('middenkader',kind,10),false,kind);
    assert.equal(canChooseSanction('officierenkader',kind,10),
      ['Degradatie','Schorsing'].includes(kind),kind);
    assert.equal(canChooseSanction('beheerder',kind,10),false,kind);
    assert.equal(canChooseSanction('korpsleiding',kind,10),true,kind);
  }
  assert.deepEqual(permittedSanctionTypes('officierenkader',8),
    [...three,'Degradatie','Schorsing']);
  assert.deepEqual(permittedSanctionTypes('officierenkader',10),
    [...three,proposal,'Degradatie','Schorsing']);
  assert.deepEqual(permittedSanctionTypes('korpsleiding',10),
    [...three,proposal,...HEAVY_SANCTION_TYPES]);
});
test('Operationele dienstrol en geen algemene of technische rechten bepalen de sancties',()=>{
  const actor={role:'korpsleiding',departments:['politie','ambulance'],
    departmentRoles:{politie:'middenkader',ambulance:'korpsleiding'},
    dossierNativeDepartments:['politie','ambulance']};
  assert.equal(roleForDepartment(actor,'politie'),'middenkader');
  assert.equal(roleForDepartment(actor,'ambulance'),'korpsleiding');
  assert.equal(canChooseSanction(roleForDepartment(actor,'politie'),'Schorsing',10),false);
  assert.equal(canChooseSanction(roleForDepartment(actor,'ambulance'),'Schorsing',10),true);
  assert.equal(mayAmend(officer('middenkader'),'sanctie','politie'),false);
  assert.equal(mayAmend(officer('officierenkader'),'sanctie','politie'),true);
});
test('Server controleert sanctie én ernst bij zowel nieuwe als bestaande registratie',()=>{
  const routes=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
  assert.match(routes,/roleForDepartment\(req\.bpd,dept\),values\.sanctionType,values\.severity/);
  assert.match(routes,/canChooseSanction\(sanctionRole,values\.sanctionType,values\.severity\)/);
  assert.match(routes,/canChooseSanction\(sanctionRole,old\.sanctionType,old\.severity\)/);
  assert.match(routes,/incident\.type|'sanctie_gewijzigd'/);
  assert.match(routes,/tx\.create\(audit/);
});
test('Interface kiest uitsluitend sancties uit serverrollen en controleert ernst',()=>{
  const page=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
  assert.match(page,/sanctionOptionsByDepartment/);
  assert.match(page,/kind!=='Voorstel tot degradatie'/);
  assert.match(page,/severity>=9&&severity<=10/);
  assert.match(page,/Tijdelijke beperking van specialisatie/);
});
