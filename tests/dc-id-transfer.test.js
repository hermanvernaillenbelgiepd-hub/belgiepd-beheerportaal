import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAdministerDcTransfer,mayCompleteDcTransfer,validTransferInput,freshTransferTarget,
 transferRosterPlan,transferSubjectFields,transferPersonDocument,applyCompletedDcAliases} from '../src/dc-id-transfer-policy.js';

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
   discordRosterEditorVerified:false}),false);
});
test('Een enkele bevoegde officier of korpsleiding kan zelf aanvragen en uitvoeren',()=>{
 const officer=actor('officierenkader');
 assert.equal(mayCompleteDcTransfer(officer,oldId,newId),true);
 assert.equal(mayCompleteDcTransfer(actor('korpsleiding'),oldId,newId),true);
 assert.equal(mayCompleteDcTransfer({...officer,discordRosterEditorVerified:false},oldId,newId),false);
 assert.equal(mayCompleteDcTransfer(officer,admin,newId),false);
 assert.equal(mayCompleteDcTransfer(officer,oldId,admin),false);
 assert.equal(mayCompleteDcTransfer(officer,oldId,oldId),false);
 assert.equal(mayCompleteDcTransfer({...officer,portalTechnicalMode:true,
   profileTechnicalAvailable:true,role:'beheerder'},oldId,newId),true);
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
test('Burgerdossiers en politie-reeksen zijn deel van een veilige overdracht',()=>{
 const routes=readFileSync(new URL('../src/dc-id-transfer-routes.js',import.meta.url),'utf8');
 assert.match(routes,/bpd_citizen_staff_dossiers/);
 assert.match(routes,/bpd_police_series_assignments/);
 assert.match(routes,/SINGLE_ID_COLLECTIONS/);
 assert.match(routes,/await collectTree\(db\.collection\(collection\)\.doc\(oldId\)/);
 assert.match(routes,/item\.source\.path\.split\('\/'\)\[0\]/);
});
test('Gearchiveerde personeelsfiche koppelt opnieuw aan de nieuwe identiteit',()=>{
 const old={dept:'politie',discordId:oldId,status:'archived',
   snapshot:{dept:'politie',personId:oldId,id:'politie:'+oldId,name:'Test',
     lastConnection:'2026-11-01'},
   createdBy:oldId,actorDiscordId:oldId};
 const moved=transferPersonDocument(old,'bpd_personnel_lifecycle',oldId,newId);
 assert.equal(moved.discordId,newId);
 assert.equal(moved.snapshot.personId,newId);
 assert.equal(moved.snapshot.id,'politie:'+newId);
 assert.equal(moved.createdBy,oldId);
 assert.equal(moved.actorDiscordId,oldId);
 assert.equal(old.snapshot.personId,oldId);
 assert.deepEqual(transferPersonDocument(old,'bpd_cases',oldId,newId).snapshot,old.snapshot);
 assert.throws(()=>transferPersonDocument({...old,snapshot:{personId:'123'}},
   'bpd_personnel_lifecycle',oldId,newId),/niet eenduidig/);
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
 assert.match(routes,/mayCompleteDcTransfer\(req\.bpd,oldId,newId\)/);
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
 assert.match(ui,/Hetzelfde bevoegde kaderlid/);
 assert.doesNotMatch(ui,/tweede beheerder|twee verschillende bevoegde beheerders|onafhankelijke goedkeuring/i);
 assert.match(access,/href="\/dc-id-overdracht.html"/);
});
