import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {mayCorrectManualCase} from '../src/management-utils.js';

const mk={discordId:'111111111111111111',role:'middenkader',
 departments:['politie'],departmentRoles:{politie:'middenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const officer={...mk,role:'officierenkader',
 departmentRoles:{politie:'officierenkader'}};
const chief={...mk,role:'korpsleiding',
 departmentRoles:{politie:'korpsleiding'}};
const subject={personId:'222222222222222222',dept:'politie',call:'434',
 rank:'Inspecteur van politie'};
const original={type:'notitie',dept:'politie',subjectDiscordId:subject.personId,
 eventDate:'2026-11-17',details:'Oorspronkelijke administratieve notitie',
 registeredBy:{discordId:'333333333333333333',name:'MK',call:'700'}};
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Officierenkader en korpsleiding kunnen handmatige kadernotities van lagere politierang corrigeren',()=>{
 assert.equal(mayCorrectManualCase(officer,subject,original),true);
 assert.equal(mayCorrectManualCase(chief,subject,original),true);
 assert.equal(mayCorrectManualCase(mk,subject,original),false);
 assert.equal(mayCorrectManualCase({...officer,discordId:subject.personId},subject,original),false);
 assert.equal(mayCorrectManualCase({...officer,dossierNativeDepartments:['brandweer']},subject,original),false);
 assert.equal(mayCorrectManualCase(officer,{...subject,rank:'Commissaris van politie',call:'930'},original),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,type:'verlof'}),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,type:'sanctie'}),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,type:'inactiviteitsping'}),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,source:'case-amendment'}),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,status:'verwijderd'}),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,registeredBy:null}),false);
 assert.equal(mayCorrectManualCase(officer,subject,{...original,nominationStatus:'approved'}),false);
});

test('Manuele kadercorrectie heeft serverautorisatie, revisiecontrole, audit en een apart weekrapport-event',()=>{
 const api=read('src/management-routes.js');
 assert.match(api,/app.patch\('\/api\/management\/cases\/:dept\/:discordId\/:entryId'/);
 assert.match(api,/mayCorrectManualCase\(req\.bpd,subject,old\)/);
 assert.match(api,/expectedModifiedAt/);
 assert.match(api,/tx.update\(ref,\{\.\.\.values,modifiedAt:at,modifiedBy:actor\}\)/);
 assert.match(api,/tx.create\(audit,\{action:'manual_case_amended'/);
 assert.match(api,/tx.create\(report,\{type:'activiteit'/);
 assert.match(api,/source:'case-amendment'/);
 assert.match(api,/tx.create\(notice/);
 assert.doesNotMatch(api,/tx.delete\(ref\)/);
});
test('Dossierformulier toont correctieknoppen enkel op server-toegestane registraties',()=>{
 const html=read('public/personeelsbeheer.html');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],
   {input:script,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.match(script,/if\(row.canAmend!==true\)return;/);
 assert.match(script,/addManualCaseCorrectionControls\(div,row,p,key\)/);
 assert.match(script,/Correctie met audit opslaan/);
 assert.match(script,/expectedModifiedAt:row.modifiedAt\|\|null/);
});
