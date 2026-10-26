import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SERVICE_FUNCTIONS,choiceFor,defaultFunction,parseServiceFunctionChange,
  parseServiceRevoke,applyServiceFunction,removeServiceFunction,
  mayEditServiceFunction
} from '../src/service-function-policy.js';
import {validUserGrant,approvedManagedEntry} from '../src/user-access.js';
const id='555555555555555555';
const manager={
  uid:'discord:111111111111111111',discordId:'111111111111111111',
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'}
};
const tech={...manager,role:'beheerder',portalTechnicalMode:true,
  profileTechnicalAvailable:true};
const original={
  status:'approved',discordId:id,role:'middenkader',
  departments:['politie','brandweer'],
  departmentRoles:{politie:'middenkader',brandweer:'basiskader'},
  serviceFunctions:{politie:'middenkader',brandweer:'brandweer'}
};
const why='Gecontroleerde diensttoewijzing';
test('All requested functions are present in each help service',()=>{
  assert.deepEqual(SERVICE_FUNCTIONS.politie.map(x=>x.label),[
    'Agentenkader','Basiskader','Middenkader','Officierenkader','Korpsleiding']);
  assert.deepEqual(SERVICE_FUNCTIONS.ambulance.map(x=>x.label),[
    'Ambulance','Verpleegkundige','Arts','Medisch-Instructeur','AZLS-leiding','DIR-MED']);
  assert.deepEqual(SERVICE_FUNCTIONS.brandweer.map(x=>x.label),[
    'Brandweer','BW-middenkader','BW-leiding','ZONE']);
  assert.deepEqual(SERVICE_FUNCTIONS.depannage.map(x=>x.label),[
    'LSRA / Depannage','F.A.S.T','Agentschap Wegen & Verkeer']);
  assert.equal(choiceFor('ambulance','dir-med').role,'korpsleiding');
  assert.equal(choiceFor('ambulance','arts').role,'basiskader');
  assert.equal(choiceFor('politie','agentenkader').role,'basiskader');
  assert.equal(defaultFunction('brandweer','officierenkader'),'bw-leiding');
});
test('A member may be Police middle, Ambulance leadership and Fire basic in one account',()=>{
  const change=parseServiceFunctionChange({
    department:'ambulance',functionId:'azls-leiding',reason:why});
  const next=applyServiceFunction(original,change);
  assert.deepEqual(next.departments,['politie','brandweer','ambulance']);
  assert.deepEqual(next.departmentRoles,{
    politie:'middenkader',brandweer:'basiskader',ambulance:'officierenkader'});
  assert.deepEqual(next.serviceFunctions,{
    politie:'middenkader',brandweer:'brandweer',ambulance:'azls-leiding'});
  assert.equal(next.role,'officierenkader','Overall ceiling is the MAX, not one cross-service rank');
  assert.equal(approvedManagedEntry({...original,...next},id)?.departmentRoles.ambulance,
    'officierenkader');
  const director=applyServiceFunction({...original,...next},parseServiceFunctionChange({
    department:'ambulance',functionId:'dir-med',reason:why}));
  assert.equal(director.role,'korpsleiding');
  assert.equal(director.departmentRoles.politie,'middenkader');
  assert.equal(director.departmentRoles.brandweer,'basiskader');
});
test('Revoking only Ambulance leaves Police and Fire intact',()=>{
  const appointed=applyServiceFunction(original,parseServiceFunctionChange({
    department:'ambulance',functionId:'dir-med',reason:why}));
  const revoked=removeServiceFunction(appointed,'ambulance');
  assert.deepEqual(revoked.departments,['politie','brandweer']);
  assert.deepEqual(revoked.departmentRoles,{
    politie:'middenkader',brandweer:'basiskader'});
  assert.equal(revoked.role,'middenkader');
  assert.equal('ambulance' in revoked.serviceFunctions,false);
  assert.throws(()=>removeServiceFunction({...original,departments:['politie']},'politie'),
    /laatste hulpdienst/);
});
test('Changes are strictly validated; illegal labels and raw role IDs never grant access',()=>{
  for(const input of [
    {department:'ambulance',functionId:'korpsleiding',reason:why},
    {department:'politie',functionId:'azls-leiding',reason:why},
    {department:'politie',functionId:'officierenkader',reason:'te kort'},
    {department:'brandweer',functionId:'zone',reason:why,discordRole:true}
  ])assert.throws(()=>parseServiceFunctionChange(input));
  assert.throws(()=>parseServiceRevoke({department:'alles',reason:why}));
  assert.throws(()=>validUserGrant({role:'korpsleiding',departments:['ambulance'],
    functionId:'arts',reason:why}),/komt niet overeen/);
  assert.equal(validUserGrant({role:'basiskader',departments:['ambulance'],
    functionId:'verpleegkundige',reason:why}).functionId,'verpleegkundige');
});
test('Police approver may only amend subordinate Police tier, not another service',()=>{
  assert.equal(mayEditServiceFunction(manager,id,original,'politie','basiskader'),true);
  assert.equal(mayEditServiceFunction(manager,id,original,'politie','officierenkader'),false);
  assert.equal(mayEditServiceFunction(manager,id,original,'ambulance','korpsleiding'),false);
  assert.equal(mayEditServiceFunction(manager,manager.discordId,original,'politie','basiskader'),false);
  assert.equal(mayEditServiceFunction(manager,id,original,'brandweer',null),false);
  assert.equal(mayEditServiceFunction(tech,id,original,'ambulance','korpsleiding',{technical:true}),true);
  assert.equal(mayEditServiceFunction(tech,tech.discordId,original,'ambulance','korpsleiding',
    {technical:true}),false);
});
test('Mutation is scoped, audited and independently gated; known IDs never imply membership',()=>{
  const routes=readFileSync(new URL('../src/user-routes.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
  assert.match(routes,/isVerifiedTechnicalRoleApprover\(req\.bpd\)/);
  assert.match(routes,/action:'service_function_update'/);
  assert.match(routes,/action:'service_function_revoke'/);
  assert.match(routes,/updatedAt:FieldValue\.serverTimestamp\(\)/);
  assert.match(routes,/app\.get\('\/api\/users\/known-ids',requireUser/);
  assert.match(routes,/\.collection\('bpd_discord_auth'\)\.limit\(LIMIT\)\.get\(\)/);
  assert.match(routes,/coverage:'alleen_gekende_portaal_leden_en_fiches'/);
  assert.match(routes,/otherDepartmentsPreserved:true/);
  assert.match(server,/installUserRoutes\(app,\{requireUser,accessList,getSnapshot\}\)/);
  assert.match(ui,/id="knownIdsSection" hidden/);
  assert.match(ui,/id="knownIdsReload"/);
  assert.match(ui,/id="accountSearch"/);
  assert.match(ui,/\/service-function'/);
  assert.match(ui,/\/service-revoke'/);
  assert.match(ui,/Andere hulpdiensten blijven behouden/);
});
