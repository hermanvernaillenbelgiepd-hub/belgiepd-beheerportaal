import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAdministerDcTransfer,validTransferInput,freshTransferTarget,
 transferRosterPlan,transferSubjectFields,applyCompletedDcAliases} from '../src/dc-id-transfer-policy.js';

const oldId='111111111111111111',newId='222222222222222222',admin='333333333333333333',
 guild='999999999999999999';
const actor=(role='officierenkader')=>({
 uid:'discord:'+admin,discordId:admin,role,
 departments:['politie'],departmentRoles:{politie:role},
 discordRosterEditorVerified:true
});
const people=[
 {dept:'politie',personId:oldId,id:'politie:'+oldId,name:'Test',
  call:'501',rank:'Inspecteur'},
 {dept:'brandweer',personId:oldId,id:'brandweer:'+oldId,name:'Test',
  call:'BW1',rank:'Brandweerman'}
];
test('Oud en nieuw Discord-ID en verplichte dossiermotivering',()=>{
 assert.deepEqual(validTransferInput({oldDiscordId:oldId,newDiscordId:newId,
 reason:'Geverifieerde overdracht van een bestaande medewerker'}).oldDiscordId,oldId);
 assert.throws(()=>validTransferInput({oldDiscordId:oldId,newDiscordId:oldId,reason:'12345678901234567890'}));
 assert.throws(()=>validTransferInput({oldDiscordId:oldId,newDiscordId:newId,reason:'te kort'}));
 assert.throws(()=>validTransferInput({oldDiscordId:'0',newDiscordId:newId,
 reason:'Geverifieerde overdracht'}));
});
test('Enkel geverifieerde hogere bevoegdheid, geen rangclaim of self spoof',()=>{
 assert.equal(mayAdministerDcTransfer(actor()),true);
 assert.equal(mayAdministerDcTransfer(actor('korpsleiding')),true);
 assert.equal(mayAdministerDcTransfer({...actor(),discordRosterEditorVerified:false}),false);
 assert.equal(mayAdministerDcTransfer({...actor(),uid:'discord:'+oldId}),false);
 assert.equal(mayAdministerDcTransfer({...actor(),role:'middenkader'}),false);
 assert.equal(mayAdministerDcTransfer({...actor(),portalTechnicalMode:true,
   profileTechnicalAvailable:true}),true);
 assert.equal(mayAdministerDcTransfer({...actor(),boardPersonnelAdmin:true,
   discordRosterEditorVerified:false}),true);
});
test('Een actueel Discord-verificatiebewijs is verplicht voor het nieuwe account',()=>{
 const good={guildId:guild,verifiedAt:Date.now(),roleIds:[]};
 assert.equal(freshTransferTarget(good,newId,guild),true);
 assert.equal(freshTransferTarget({...good,guildId:oldId},newId,guild),false);
 assert.equal(freshTransferTarget({...good,verifiedAt:Date.now()-90000000},newId,guild),false);
 assert.equal(freshTransferTarget({...good,roleIds:['bad']},newId,guild),false);
});
test('Overdracht omvat meerdere diensten maar weigert dubbels en bestaand nieuw account',()=>{
 const plan=transferRosterPlan(people,oldId,newId);
 assert.deepEqual(plan.departments,['brandweer','politie']);
 assert.equal(plan.personnel.length,2);
 assert.throws(()=>transferRosterPlan([...people,people[0]],oldId,newId));
 assert.throws(()=>transferRosterPlan([...people,{...people[0],personId:newId}],oldId,newId));
 assert.throws(()=>transferRosterPlan([],oldId,newId));
});
test('Alleen subjectreferenties veranderen, audit van de oorspronkelijke actor blijft',()=>{
 const input={discordId:oldId,personDiscordId:oldId,subjectDiscordId:oldId,
  applicantDiscordId:oldId,personId:oldId,actorDiscordId:oldId,
  createdBy:oldId,registeredBy:{discordId:oldId}};
 const next=transferSubjectFields(input,oldId,newId);
 assert.equal(next.discordId,newId);
 assert.equal(next.personDiscordId,newId);
 assert.equal(next.subjectDiscordId,newId);
 assert.equal(next.applicantDiscordId,newId);
 assert.equal(next.personId,newId);
 assert.equal(next.actorDiscordId,oldId);
 assert.equal(next.createdBy,oldId);
 assert.equal(next.registeredBy.discordId,oldId);
 assert.equal(input.discordId,oldId);
});
test('Een afgeronde identiteit wordt transparant geprojecteerd op alle diensten',()=>{
 const alias={id:oldId,data:()=>({status:'completed',newDiscordId:newId})};
 const result=applyCompletedDcAliases([...people,{...people[0],personId:newId}],[alias]);
 assert.deepEqual(result.map(x=>x.personId),[newId,newId]);
 assert.equal(result[0].sourceDiscordId,oldId);
 assert.equal(result[0].identityTransferred,true);
 assert.equal(applyCompletedDcAliases(people,[{id:oldId,data:()=>({status:'pending',newDiscordId:newId})}])[0].personId,oldId);
});
test('Geen rolkoppelingen of machtigingen worden meegekopieerd',()=>{
 const routes=readFileSync(new URL('../src/dc-id-transfer-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/dc-id-overdracht.html',import.meta.url),'utf8');
 const access=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 assert.match(routes,/DC_TRANSFER_TARGETS/);
 assert.match(routes,/BPD_ENABLE_DC_ID_TRANSFERS!=='true'/);
 assert.match(routes,/get\('status'\)==='pending'|get\('status'\)!=='pending'/);
 assert.match(routes,/doc\.get\('createdBy'\)===req\.bpd\.discordId/);
 assert.match(routes,/status:'blocked'/);
 assert.match(routes,/req\.body\.confirmation!=='OVERDRAGEN'/);
 assert.match(routes,/tx\.create\(alias/);
 assert.match(routes,/tx\.create\(item\.target/);
 assert.match(routes,/tx\.update\(item\.doc\.ref/);
 assert.doesNotMatch(routes,/tx\.delete\(item\.source|tx\.delete\(oldAccount/);
 assert.doesNotMatch(routes,/setCustomUserClaims|roleIds:.*old|discordBotToken/);
 assert.match(server,/applyCompletedDcAliases/);
 assert.match(server,/installDcIdTransferRoutes/);
 assert.match(server,/DC_TRANSFER_ALIASES/);
 assert.match(ui,/requiresSecondAdministrator|tweede beheerder|twee verschillende/);
 assert.match(access,/href="\/dc-id-overdracht.html"/);
});
