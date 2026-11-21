import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAnnotateDossierCase,mayCorrectManualCase} from '../src/management-utils.js';
import {mayRetireCaseType} from '../src/dossier-retirement-policy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='222222222222222222',actorId='111111111111111111';
const subject={dept:'politie',personId:id,call:'316',rank:'Aspirant Inspecteur',
  name:'Collega J',status:'Actief'};
const chief={uid:'discord:'+actorId,discordId:actorId,
  role:'korpsleiding',discordPoliceRank:'korpsleiding',
  departments:['politie'],departmentRoles:{politie:'korpsleiding'},
  dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const officer={...chief,role:'officierenkader',
  discordPoliceRank:'officierenkader',
  departmentRoles:{politie:'officierenkader'}};
const historical={type:'personeelsbeweging',dept:'politie',
  subjectDiscordId:id,details:'Promotie 3XX naar 4XX',
  registeredBy:{discordId:actorId},movement:'Promotie',
  eventDate:'2026-10-20'};
const effective={...historical,source:'personnel-rank-change',
  previousRank:'Aspirant Inspecteur',previousCall:'316',
  newRank:'Inspecteur',newCall:'420'};

test('Police officer and corps can annotate an existing manual personnel movement',()=>{
 assert.equal(mayAnnotateDossierCase(officer,subject,historical),true);
 assert.equal(mayAnnotateDossierCase(chief,subject,historical),true);
 assert.equal(mayCorrectManualCase(officer,subject,historical),true);
 assert.equal(mayCorrectManualCase(chief,subject,historical),true);
 assert.equal(mayRetireCaseType(historical),true);
});
test('effective 316 -> 420 may be annotated but cannot be deleted as a historical error',()=>{
 assert.equal(mayAnnotateDossierCase(officer,subject,effective),true);
 assert.equal(mayCorrectManualCase(officer,subject,effective),false);
 assert.equal(mayRetireCaseType(effective),false);
 assert.equal(mayRetireCaseType({...effective,source:'approved-promotion-proposal'}),false);
 assert.equal(mayRetireCaseType({...historical,proposalStatus:'approved'}),false);
 assert.equal(mayRetireCaseType({...historical,source:'global-personnel-archive'}),false);
 assert.equal(mayRetireCaseType({...historical,source:'central-leave-audit'}),false);
});
test('subordinates, other services, missing proof and self may not annotate',()=>{
 assert.equal(mayAnnotateDossierCase({...officer,role:'middenkader',
   departmentRoles:{politie:'middenkader'}},subject,historical),false);
 assert.equal(mayAnnotateDossierCase({...officer,dossierAllowedDepartments:[]},
   subject,historical),false);
 assert.equal(mayAnnotateDossierCase({...officer,discordId:id,uid:'discord:'+id},
   subject,historical),false);
 assert.equal(mayAnnotateDossierCase(officer,subject,{...historical,
   dept:'ambulance'}),false);
 assert.equal(mayAnnotateDossierCase(officer,subject,{...historical,
   subjectDiscordId:actorId}),false);
 assert.equal(mayAnnotateDossierCase(officer,subject,{...historical,
   status:'verwijderd'}),false);
});
test('verified dual-role technical profile cannot create power from profile switching alone',()=>{
 const technical={...chief,role:'beheerder',portalTechnicalMode:true,
   operationalRole:'korpsleiding',operationalDepartmentRoles:{politie:'korpsleiding'},
   profileTechnicalAvailable:true};
 assert.equal(mayAnnotateDossierCase(technical,subject,historical),true);
 assert.equal(mayAnnotateDossierCase({...technical,operationalRole:'beheerder'},
   subject,historical),false);
 assert.equal(mayAnnotateDossierCase({...technical,profileTechnicalAvailable:false},
   subject,historical),false);
});
test('correction route uses a transaction, CAS revision, audit and report event; no underlying rank mutation',()=>{
 const src=read('src/management-routes.js');
 const start=src.indexOf("app.post('/api/management/cases/:dept/:discordId/:entryId/administrative-correction'");
 const end=src.indexOf('// Narrow self-note exception',start);
 assert.ok(start>0&&end>start);
 const route=src.slice(start,end);
 assert.match(route,/mayAnnotateDossierCase\(req\.bpd,subject,old\)/);
 assert.match(route,/body\.expectedModifiedAt/);
 assert.match(route,/store\.runTransaction\(async tx=>/);
 assert.match(route,/tx\.create\(audit,/);
 assert.match(route,/action:'case_administrative_correction'/);
 assert.match(route,/source:'case-administrative-correction'/);
 assert.match(route,/tx\.create\(notice,/);
 assert.match(route,/effectiveDecisionChanged:false/);
 assert.doesNotMatch(route,/tx\.update\(ref,\{[\s\S]*?\bnewRank:/);
 assert.doesNotMatch(route,/tx\.delete\(/);
});
test('original registration remains, corrected display and audit shown on personnel fiche',()=>{
 const manager=read('src/management-routes.js');
 const page=read('public/personeelsbeheer.html');
 assert.match(manager,/e\.administrativeCorrection\?\.details/);
 assert.match(manager,/canAnnotate:enabled\(\)&&mayAnnotateDossierCase/);
 assert.match(manager,/canRetire:enabled\(\)&&mayAnnotateDossierCase/);
 assert.match(page,/function attachAdministrativeCaseCorrection\(container,row\)/);
 assert.match(page,/Toelichting corrigeren/);
 assert.match(page,/Auditlog/);
 assert.match(page,/administrative-correction/);
 assert.match(page,/Een effectieve beslissing wordt niet teruggedraaid/);
 assert.match(page,/attachAdministrativeCaseCorrection\(item,row\)/);
 const policy=read('src/dossier-retirement-policy.js');
 assert.match(policy,/!entry\.source&&!entry\.proposalStatus/);
});
