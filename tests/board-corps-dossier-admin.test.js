import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedBoardCorpsDossierAdmin,dossierAuthorityRole,BOARD_CORPS_DOSSIER_DEPTS}
  from '../src/board-corps-dossier-policy.js';
import {applyDossierGrants} from '../src/dossier-grants.js';
import {canEditPersonnel,canReadPersonnelSubject} from '../src/personnel-editor-policy.js';
import {canChangeSpecialty,allowedSpecialty} from '../src/specialization-policy.js';
import {fireMayCreate,fireCanWithdrawSanction,fireSanctionLevel}
  from '../src/fire-dossier-policy.js';
import {maySubmit,mayAmend} from '../src/registrations.js';
import {mayWriteManagement} from '../src/management-utils.js';

const myId='111111111111111111',otherId='222222222222222222';
const all=['politie','ambulance','brandweer','depannage'];
const actor=(more={})=>({
  uid:'discord:'+myId,discordId:myId,role:'korpsleiding',
  departments:['politie'],departmentRoles:{politie:'korpsleiding'},
  boardPersonnelAdmin:true,discordPoliceRank:'korpsleiding',
  dossierSourceFresh:true,dossierNativeDepartments:all,
  dossierAllowedDepartments:all,dossierFullDepartments:all,
  dossierManageDepartments:all,...more
});
const person=dept=>({dept,personId:otherId,rank:'Ambulancier',
  call:dept==='politie'?'910':'AMB-10'});
test('Only independently verified BOARD + Police Korpsleiding can claim all-service edit',()=>{
  assert.deepEqual([...BOARD_CORPS_DOSSIER_DEPTS],all);
  assert.equal(verifiedBoardCorpsDossierAdmin(actor()),true);
  for(const notAllowed of [
    {boardPersonnelAdmin:false},
    {role:'officierenkader'},
    {departmentRoles:{politie:'officierenkader'}},
    {departments:['ambulance']},
    {discordPoliceRank:'officierenkader',manualCorpsApproved:false},
    {uid:'google:111111111111111111'},
    {dossierSourceFresh:false},
    {portalTechnicalMode:true},
    {discordId:'broken'},
    {boardPersonnelAdmin:false,manualCorpsApproved:true}
  ])assert.equal(verifiedBoardCorpsDossierAdmin(actor(notAllowed)),false,
    JSON.stringify(notAllowed));
  assert.equal(verifiedBoardCorpsDossierAdmin(actor({
    discordPoliceRank:null,manualCorpsApproved:true})),true,
    'Separately approved audit-backed Corps rank may replace a missing current Discord rank');
});
test('Regular Bestuur stays read-only; Corps without Bestuur stays Police-only',()=>{
  const board=actor({role:'basiskader',departmentRoles:{politie:'basiskader'},
    discordPoliceRank:null});
  const boardScope=applyDossierGrants(board,all,[]);
  assert.deepEqual(boardScope.departments,all);
  assert.deepEqual(boardScope.fullDepartments,[]);
  const corps=actor({boardPersonnelAdmin:false,dossierNativeDepartments:['politie'],
    dossierAllowedDepartments:['politie'],dossierFullDepartments:[]});
  const corpsScope=applyDossierGrants(corps,['politie'],[]);
  assert.deepEqual(corpsScope.fullDepartments,[]);
  assert.deepEqual(corpsScope.departments,['politie']);
  const both=applyDossierGrants(actor(),['politie'],[]);
  assert.deepEqual(both.departments,all);
  assert.deepEqual(both.fullDepartments,all);
  assert.deepEqual(both.manageDepartments,all);
});
test('Verified dual-occupant may edit other people in every dossier but never own file',()=>{
  for(const dept of all){
    const p=person(dept);
    assert.equal(canReadPersonnelSubject(actor(),p),true,dept);
    assert.equal(canEditPersonnel(actor(),p),true,dept);
    assert.equal(canEditPersonnel(actor(),{...p,personId:myId}),false,
      'Own personnel dossier must never be altered');
    assert.equal(dossierAuthorityRole(actor(),dept),'korpsleiding');
    assert.equal(mayWriteManagement(actor(),dept,'notitie'),true);
    assert.equal(mayWriteManagement(actor(),dept,'opleiding'),true);
    assert.equal(mayWriteManagement(actor(),dept,'personeelsbeweging'),true);
    assert.equal(maySubmit(actor(),'observatie',dept),true);
    assert.equal(maySubmit(actor(),'sanctie',dept),true);
    assert.equal(mayAmend(actor(),'sanctie',dept),true);
  }
  assert.equal(mayWriteManagement(actor(),'politie','verlof'),false,
    'Leave approvals use separately verified procedures');
  assert.equal(canChangeSpecialty(actor(),person('ambulance')),true);
  assert.equal(canChangeSpecialty(actor(),person('brandweer')),true);
  assert.equal(allowedSpecialty('politie','LRD (Recherche)'),false,
    'A dossier editor cannot forge the Recherche Discord role');
});
test('Fire corrections work for dual-verified Board/Corps but not ordinary Board',()=>{
  const subject=person('brandweer');
  assert.equal(fireMayCreate(actor(),subject,null,'sanctie'),true);
  assert.equal(fireMayCreate(actor(),subject,null,'notitie'),true);
  assert.equal(fireCanWithdrawSanction(actor(),subject,null),true);
  assert.equal(fireSanctionLevel(actor()),'korpsleiding');
  const ordinary=actor({role:'basiskader',discordPoliceRank:null,
    departmentRoles:{politie:'basiskader'}});
  assert.equal(fireMayCreate(ordinary,subject,null,'sanctie'),false);
  assert.equal(fireCanWithdrawSanction(ordinary,subject,null),false);
  assert.equal(fireMayCreate(actor(),{...subject,personId:myId},null,'sanctie'),false);
});
test('Protected middleware verifies roles before granting full dossier scope',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const entries=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
  const special=readFileSync(new URL('../src/specialization-routes.js',import.meta.url),'utf8');
  const fire=readFileSync(new URL('../src/fire-dossier-routes.js',import.meta.url),'utf8');
  assert.match(server,/req\.bpd\.boardPersonnelAdmin=Boolean/);
  assert.match(server,/req\.bpd\.dossierSourceFresh=snapshot\.stale!==true/);
  assert.match(server,/req\.bpd\.boardCorpsDossierAdmin=verifiedBoardCorpsDossierAdmin/);
  assert.match(server,/applyDossierGrants\(req\.bpd,original/);
  assert.match(entries,/verifiedBoardCorpsDossierAdmin\(req\.bpd\)&&id===req\.bpd\.discordId/);
  assert.match(entries,/dossierAuthorityRole\(req\.bpd,dept\)/);
  assert.match(special,/canChangeSpecialty\(req\.bpd,staff\)/);
  assert.match(fire,/verifiedBoardCorpsDossierAdmin\(req\.bpd\)/);
});
