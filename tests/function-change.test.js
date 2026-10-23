import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROLE_CATALOG} from '../src/role-catalog.js';
import {FUNCTION_ROLES,functionalRoles,functionRole,verifiedFunctionalRoleIds,
  canRecordFunctionChange,validateFunctionChange,applyFunctionChange,describeFunctionChange}
  from '../src/function-change-policy.js';
import {reportSections} from '../src/management-utils.js';

const find=(dept,name)=>FUNCTION_ROLES.find(x=>x.dept===dept&&x.name===name)?.id;
const k9io=find('politie','K9-IO'),k9=find('politie','K9');
const fire=find('brandweer','Ladderwagen');
const reason='Opleiding gecontroleerd; functieovergang goedgekeurd door bevoegd kaderlid.';
const id='123456789012345678';
const person=(dept='politie')=>({dept,personId:id,rank:'Agent',call:'201'});
const actor=(dept,role,other={})=>({
  role,departments:[dept],departmentRoles:{[dept]:role},
  dossierNativeDepartments:[dept],discordId:'223456789012345678',...other
});
const payload=(action,previousRoleId,newRoleId)=>({
  action,previousRoleId,newRoleId,reason,expectedRevision:0
});
test('Alleen operationele specialisatierollen, nooit kader- of Discord-toegangsrollen',()=>{
  assert.ok(k9io&&k9&&fire);
  assert.equal(functionRole(k9).name,'K9');
  assert.ok(functionalRoles('brandweer').some(x=>x.name==='Ladderwagen'));
  assert.ok(functionalRoles('brandweer').some(x=>x.name==='Duiker'));
  assert.equal(functionRole(ROLE_CATALOG.find(x=>x.name==='Korpsleiding').id),null);
  assert.ok(FUNCTION_ROLES.every(x=>x.kind===undefined&&
    ['brandweer','politie'].includes(x.dept)));
});
test('Bevoegd Officierenkader kan politie-functie wijzigen, Middenkader niet',()=>{
  assert.equal(canRecordFunctionChange(actor('politie','officierenkader'),person()),true);
  assert.equal(canRecordFunctionChange(actor('politie','korpsleiding'),person()),true);
  assert.equal(canRecordFunctionChange(actor('politie','middenkader'),person()),false);
  assert.equal(canRecordFunctionChange(actor('politie','beheerder'),person()),false);
  assert.equal(canRecordFunctionChange(actor('politie','officierenkader',
    {discordId:id}),person()),false);
});
test('Brandweerfuncties zijn alleen bewerkbaar binnen bevoegd brandweerdossier',()=>{
  const fw={...person('brandweer'),rank:'Brandweerman'};
  assert.equal(canRecordFunctionChange(actor('politie','officierenkader'),fw),false);
  assert.equal(canRecordFunctionChange(actor('brandweer','officierenkader'),fw),true);
  const zone=actor('brandweer','basiskader',{fireZoneChief:true});
  assert.equal(canRecordFunctionChange(zone,fw),true);
  assert.equal(canRecordFunctionChange(actor('brandweer','middenkader'),fw),false);
});
test('K9-IO → K9 en extra brandweerrol hebben correcte oude en nieuwe functie',()=>{
  const move=validateFunctionChange(payload('replace',k9io,k9),'politie');
  assert.deepEqual(applyFunctionChange([k9io],move),[k9]);
  assert.equal(describeFunctionChange(move).description,'Functiewijziging: K9-IO → K9');
  const add=validateFunctionChange(payload('add',null,fire),'brandweer');
  assert.deepEqual(applyFunctionChange([],add),[fire]);
  assert.equal(describeFunctionChange(add).to,'Ladderwagen');
  const remove=validateFunctionChange(payload('remove',fire,null),'brandweer');
  assert.deepEqual(applyFunctionChange([fire],remove),[]);
});
test('Weiger toegang, dubbele rollen, ontbrekende oude rol en ongeldige motivatie',()=>{
  assert.throws(()=>validateFunctionChange(payload('replace',k9io,fire),'politie'),/hulpdienst/);
  assert.throws(()=>validateFunctionChange(payload('add',null,
    ROLE_CATALOG.find(x=>x.name==='Korpsleiding').id),'politie'),/hulpdienst/);
  assert.throws(()=>applyFunctionChange([k9],payload('replace',k9io,k9)),/vorige functie/);
  assert.throws(()=>applyFunctionChange([k9],payload('add',null,k9)),/al geregistreerd/);
  assert.throws(()=>validateFunctionChange({...payload('replace',k9io,k9),reason:'kort'},'politie'),/Motivering/);
  assert.throws(()=>validateFunctionChange({...payload('replace',k9io,k9),expectedRevision:-1},'politie'),/Vernieuw/);
});
test('Verifieer Discord-rolweergave, maar ken nooit rechten toe uit onbetrouwbare bron',()=>{
  const guild='323456789012345678',now=Date.now();
  const member={guildId:guild,verifiedAt:now,roleIds:[k9io,k9]};
  assert.deepEqual(verifiedFunctionalRoleIds(member,'politie',guild,now),[k9io,k9]);
  assert.equal(verifiedFunctionalRoleIds({...member,verifiedAt:now-16*60*1000},'politie',guild,now),null);
  assert.equal(verifiedFunctionalRoleIds({...member,guildId:'423456789012345678'},'politie',guild,now),null);
});
test('Functiewijzigingen worden in dynamisch weekrapport opgenomen',()=>{
  const date='2026-10-23',entry={type:'functiewijziging',eventDate:date,
    previousFunction:'K9-IO',newFunction:'K9',details:'Functiewijziging: K9-IO → K9'};
  const section=reportSections([entry],date,date).find(x=>x.type==='functiewijziging');
  assert.equal(section.label,'Functiewijziging');
  assert.equal(section.entries.length,1);
  assert.equal(reportSections([{...entry,testRecord:true}],date,date)
    .find(x=>x.type==='functiewijziging').entries.length,0);
  const routes=readFileSync(new URL('../src/function-change-routes.js',import.meta.url),'utf8');
  assert.match(routes,/tx\.create\(activity/);
  assert.match(routes,/tx\.create\(caseEntry/);
  assert.match(routes,/tx\.create\(notification/);
  assert.match(routes,/discordRoleChanged:false,portalAccessChanged:false/);
});
