import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANUAL_ROLE_CATALOG,manualRoleChoice} from '../src/manual-role-catalog.js';
import {approvedManagedEntry,validUserGrant} from '../src/user-access.js';
import {activeManualCitizenCouncil,verifiedManualCitizenCouncil,
 canAccessCitizenDossier,canWriteCitizenDossier,canDeleteCitizenEntry}
 from '../src/citizen-dossier-policy.js';
import {permittedCheckrideTracks} from '../src/checkride-policy.js';
import {manualRoleDecisionScope} from '../src/manual-role-decision-policy.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='123456789012345678',requester='223456789012345678',approver='323456789012345678',
 guild='423456789012345678',now=Date.now();
const record={
 discordId:id,status:'approved',role:'basiskader',
 departments:['burger'],departmentRoles:{burger:'basiskader'},
 citizenCouncilRecovery:{dept:'burger',role:'basiskader',
  requestedBy:'discord:'+requester,approvedBy:'discord:'+approver,
  approvalMethod:'independent'}
};
const member={guildId:guild,verifiedAt:now-1000,roleIds:['1309532438019706966']};
const actor={uid:'discord:'+id,discordId:id,role:'basiskader',
 departments:['burger'],departmentRoles:{burger:'basiskader'},
 manualCitizenCouncilApproved:true};
test('Burgerraad is a non-elevated service role, not a global corps appointment',()=>{
 assert.deepEqual(MANUAL_ROLE_CATALOG.burger.map(x=>x.role),['basiskader']);
 assert.ok(manualRoleChoice('burger','basiskader'));
 assert.equal(manualRoleChoice('burger','korpsleiding'),null);
 assert.throws(()=>validUserGrant({role:'korpsleiding',departments:['burger'],
  reason:'Geen Burger korpsleiding via algemeen accountbeheer'}));
 assert.deepEqual(approvedManagedEntry(record,id)?.departments,['burger']);
});
test('manual citizen council requires approved two-person receipt and scoped account',()=>{
 assert.equal(activeManualCitizenCouncil(record,id),true);
 for(const invalid of [
  {...record,status:'pending'}, {...record,status:'blocked'},
  {...record,departments:['politie'],departmentRoles:{politie:'basiskader'}},
  {...record,citizenCouncilRecovery:{...record.citizenCouncilRecovery,
    approvedBy:'discord:'+id}},
  {...record,citizenCouncilRecovery:{...record.citizenCouncilRecovery,
    requestedBy:'discord:'+id}},
  {...record,citizenCouncilRecovery:{...record.citizenCouncilRecovery,
    approvedBy:'discord:'+requester}},
  {...record,citizenCouncilRecovery:{...record.citizenCouncilRecovery,
    role:'korpsleiding'}},
  {...record,citizenCouncilRecovery:null}
 ])assert.equal(activeManualCitizenCouncil(invalid,id),false);
 assert.equal(activeManualCitizenCouncil(record,'999999999999999999'),false);
});
test('verified technical exception cannot grant own Burgerraad role',()=>{
 const tech={uid:'discord:'+approver,discordId:approver,role:'beheerder',
  portalTechnicalMode:true,profileTechnicalAvailable:true};
 assert.equal(manualRoleDecisionScope(tech,{requestedBy:tech.uid},id).allowed,true);
 assert.equal(manualRoleDecisionScope(tech,{requestedBy:'discord:'+requester},approver).allowed,false);
 assert.equal(activeManualCitizenCouncil({...record,citizenCouncilRecovery:{
  ...record.citizenCouncilRecovery,approvalMethod:'verified_technical_single_approver',
  requestedBy:'discord:'+approver}},id),true);
});
test('manual council only works for same signed-in guild member and fresh proof',()=>{
 assert.equal(verifiedManualCitizenCouncil(actor,member,guild,now),true);
 assert.equal(verifiedManualCitizenCouncil({...actor,manualCitizenCouncilApproved:false},member,guild,now),false);
 assert.equal(verifiedManualCitizenCouncil({...actor,uid:'discord:'+approver},member,guild,now),false);
 assert.equal(verifiedManualCitizenCouncil({...actor,departments:['politie'],departmentRoles:{politie:'korpsleiding'}},member,guild,now),false);
 assert.equal(verifiedManualCitizenCouncil(actor,{...member,verifiedAt:now-16*60*1000},guild,now),false);
 assert.equal(verifiedManualCitizenCouncil(actor,{...member,guildId:approver},guild,now),false);
});
test('approved Burgerraad may write other citizen dossiers but cannot delete',()=>{
 assert.equal(canAccessCitizenDossier(actor,true),true);
 assert.equal(canWriteCitizenDossier(actor,true,approver),true);
 assert.equal(canWriteCitizenDossier(actor,true,id),false);
 assert.equal(canDeleteCitizenEntry(actor,approver),false);
 assert.equal(canAccessCitizenDossier({...actor,role:'korpsleiding',departments:['burger'],
  departmentRoles:{burger:'basiskader'},manualCitizenCouncilApproved:false},false),false);
});
test('BIO assessments permitted only to approved council with own unique burger fiche',()=>{
 const own=[{dept:'burger',personId:id}];
 assert.deepEqual(permittedCheckrideTracks(actor,member,own,guild,now),['burger_io']);
 assert.deepEqual(permittedCheckrideTracks({...actor,manualCitizenCouncilApproved:false},member,own,guild,now),[]);
 assert.deepEqual(permittedCheckrideTracks(actor,member,[...own,...own],guild,now),[]);
 assert.deepEqual(permittedCheckrideTracks(actor,member,[{dept:'politie',personId:id}],guild,now),[]);
 assert.deepEqual(permittedCheckrideTracks(actor,{...member,verifiedAt:now-25*60*60*1000},own,guild,now),[]);
});
test('routes enforce real Burger personnel identity and publish revocation with audit',()=>{
 const route=source('src/manual-role-routes.js'),server=source('src/server.js'),
  citizen=source('src/citizen-dossier-routes.js'),html=source('public/gebruikersbeheer.html');
 assert.match(route,/confirmCitizenPersonnel\(data\)/);
 assert.match(route,/confirmCitizenPersonnel\(\{dept,role:'basiskader',discordId\}\)/);
 assert.match(route,/canConfirmCitizenCouncil\(req\.bpd\)/);
 assert.match(route,/manualRoleDecisionScope\(req\.bpd,request,discordId\)/);
 assert.match(route,/citizenCouncilRecovery:/);
 assert.match(route,/manual_citizen_council_revoked/);
 assert.match(route,/otherDepartmentsPreserved:true/);
 assert.match(server,/activeManualCitizenCouncil\(managed\.data\(\),id\)/);
 assert.match(server,/manualCitizenCouncilApproved=Boolean\(citizenCouncilApproved/);
 assert.match(citizen,/verifiedManualCitizenCouncil\(actor,fresh,process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(citizen,/live\.status==='not_member'\?null/);
 assert.match(html,/value="burger">Burger/);
 assert.match(html,/Burgerraad intrekken/);
});
