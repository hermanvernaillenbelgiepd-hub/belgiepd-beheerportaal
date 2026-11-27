import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANUAL_ROLE_CATALOG,manualRoleChoice,manualRoleLabel}
  from '../src/manual-role-catalog.js';
import {choiceFor} from '../src/service-function-policy.js';
import {canReadServiceDossier} from '../src/service-dossier-access.js';

test('Manual recovery includes basic and higher operational functions per service',()=>{
 assert.deepEqual(MANUAL_ROLE_CATALOG.politie.map(x=>x.functionId),
   ['agentenkader','basiskader','middenkader','officierenkader','korpsleiding']);
 assert.deepEqual(MANUAL_ROLE_CATALOG.ambulance.map(x=>x.functionId),
   ['ambulance','verpleegkundige','arts','medisch-instructeur','azls-leiding','dir-med']);
 assert.deepEqual(MANUAL_ROLE_CATALOG.brandweer.map(x=>x.functionId),
   ['brandweer','bw-middenkader','bw-leiding','zone']);
 assert.deepEqual(MANUAL_ROLE_CATALOG.depannage.map(x=>x.functionId),['lsra','fast','awv']);
 assert.deepEqual(MANUAL_ROLE_CATALOG.burger.map(x=>x.role),['basiskader']);
 assert.equal(manualRoleChoice('burger','basiskader')?.functionId,undefined);
 assert.equal(manualRoleChoice('burger','korpsleiding'),null);
 assert.equal(manualRoleChoice('depannage','officierenkader'),null);
 assert.match(manualRoleLabel('ambulance','middenkader'),/instructeur/i);
 assert.match(manualRoleLabel('brandweer','korpsleiding'),/ZONE/);
 assert.match(manualRoleLabel('depannage','korpsleiding'),/Agentschap Wegen en Verkeer/);
});

test('Agentenkader and Basiskader are separate options at the same restricted portal tier',()=>{
 const ak=manualRoleChoice('politie','basiskader','agentenkader');
 const bk=manualRoleChoice('politie','basiskader','basiskader');
 assert.equal(ak?.role,'basiskader');
 assert.equal(bk?.role,'basiskader');
 assert.notEqual(ak.functionId,bk.functionId);
 assert.equal(manualRoleChoice('politie','basiskader'),null);
 assert.equal(manualRoleChoice('politie','basiskader','korpsleiding'),null);
 assert.equal(manualRoleChoice('ambulance','basiskader'),null);
 assert.match(manualRoleLabel('politie','basiskader','agentenkader'),/Agentenkader/);
 assert.match(manualRoleLabel('politie','basiskader','basiskader'),/Basiskader/);
 assert.equal(canReadServiceDossier({departmentRoles:{politie:'basiskader'},
   departments:['politie'],role:'basiskader',
   dossierAllowedDepartments:['politie']},'politie'),false);
});

test('All manual service function choices match the canonical approved portal function tier',()=>{
 for(const [dept,choices] of Object.entries(MANUAL_ROLE_CATALOG)){
   const keys=new Set(),labels=new Set();
   for(const choice of choices){
     assert.ok(['basiskader','middenkader','officierenkader','korpsleiding'].includes(choice.role));
     const key=choice.functionId||choice.role;
     assert.equal(keys.has(key),false);
     assert.equal(labels.has(choice.label),false);
     keys.add(key);labels.add(choice.label);
     assert.equal(manualRoleChoice(dept,choice.role,choice.functionId)?.label,choice.label);
     if(dept!=='burger')assert.equal(choiceFor(dept,choice.functionId)?.role,choice.role);
   }
 }
 assert.equal(manualRoleChoice('ambulance','beheerder'),null);
});

test('Server checks the selected function, official personnel record, independence and audit',()=>{
 const routes=readFileSync(new URL('../src/manual-role-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 assert.match(routes,/manualRoleChoice\(body\.dept,body\.role,body\.functionId\)/);
 assert.match(routes,/Selecteer de concrete basisfunctie/);
 assert.match(routes,/confirmBasicPersonnel\(data\)/);
 assert.match(routes,/confirmBasicPersonnel\(priorRequest\)/);
 assert.match(routes,/policeKader\(staff\.rank,staff\.call\)/);
 assert.match(routes,/!manualRoleChoice\(dept,request\.role,request\.functionId\)/);
 assert.match(routes,/serviceFunctions\[dept\]=request\.functionId/);
 assert.match(routes,/departments,departmentRoles,serviceFunctions/);
 assert.match(routes,/!canChangeUser\(req\.bpd,discordId,candidate/);
 assert.match(routes,/manualRoleDecisionScope\(req\.bpd,request,discordId\)/);
 assert.match(routes,/roleCatalog:MANUAL_ROLE_CATALOG/);
 assert.match(routes,/manualRoleRecovery:\{dept,role:request\.role/);
 assert.match(routes,/citizenCouncilRecovery:\{dept:'burger',role:'basiskader'/);
 assert.match(page,/manualRoleCatalog=data\.roleCatalog\|\|null/);
 assert.match(page,/updateManualServiceRoleOptions/);
 assert.match(page,/item\.value=choice\.functionId\|\|choice\.role/);
 assert.match(page,/role:selected\.role/);
 assert.match(page,/item\.roleLabel\|\|roleNames\[item\.role\]/);
 assert.match(page,/Voor <strong>Burger → Burgerraad<\/strong>/);
});
