import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayWriteManagement} from '../src/management-utils.js';
import {retirementReason,mayRetireCaseType,isRetired,
 canRetireDossierRecord} from '../src/dossier-retirement-policy.js';
import {publicStaffNote} from '../src/staff-dossier-policy.js';

const contents=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Legacy verlofnotitie is no longer an entry option or a writable case',()=>{
 const html=contents('public/personeelsbeheer.html');
 assert.match(html,/type==='activiteit'\|\|type==='verlof'/);
 const actor={role:'middenkader',discordId:'111111111111111111',
  departments:['politie'],departmentRoles:{politie:'middenkader'},
  dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
 assert.equal(mayWriteManagement(actor,'politie','verlof'),false);
 assert.equal(mayWriteManagement(actor,'politie','notitie'),true);
});
test('Retirement reasons are explicit, length checked and single-field only',()=>{
 assert.equal(retirementReason({reason:' Corrigeren wegens onjuiste inhoud '}),'Corrigeren wegens onjuiste inhoud');
 for(const request of [{},{reason:'kort'},{reason:'x'.repeat(501)},
  {reason:'Voldoende lang',deleteEverything:true},null]){
  assert.throws(()=>retirementReason(request));
 }
});
test('Only genuine record types are retirably case records',()=>{
 for(const type of ['notitie','specialisatiebeperking','observatie','sanctie','basisnotitie'])
  assert.equal(mayRetireCaseType({type}),true);
 for(const type of ['verlof','activiteit','opleiding','personeelsbeweging'])
  assert.equal(mayRetireCaseType({type}),false);
 assert.equal(mayRetireCaseType({type:'notitie',source:'central-leave-audit'}),false);
 assert.equal(isRetired({status:'verwijderd'}),true);
 assert.equal(isRetired({status:'actief'}),false);
});
test('Soft-retired staff notes are not part of the live dossier',()=>{
 assert.equal(publicStaffNote({kind:'begeleiding',title:'Notitie',details:'Actieve notitie'},'12345')?.title,'Notitie');
 assert.equal(publicStaffNote({kind:'begeleiding',title:'Notitie',status:'verwijderd'},'12345'),null);
});
test('Retiring always requires verified higher duty role with dossier access',()=>{
 const base={discordId:'111111111111111111',role:'middenkader',
  departments:['politie'],departmentRoles:{politie:'middenkader'},
  dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
 const subject={personId:'222222222222222222',dept:'politie',call:'400',
  rank:'Inspecteur van politie'};
 assert.equal(canRetireDossierRecord(base,subject),false);
 assert.equal(canRetireDossierRecord({...base,role:'officierenkader',
  departmentRoles:{politie:'officierenkader'}},subject),true);
 assert.equal(canRetireDossierRecord({...base,role:'officierenkader',
  departmentRoles:{politie:'officierenkader'}},{...subject,personId:base.discordId}),false);
 assert.equal(canRetireDossierRecord({...base,role:'officierenkader',
  departmentRoles:{politie:'officierenkader'},
  dossierNativeDepartments:['brandweer']},subject),false);
});
test('All retire actions retain original records and add week-report events',()=>{
 const api=contents('src/dossier-retirement-routes.js');
 assert.match(api,/tx\.update\(ref,\{status:'verwijderd'/);
 assert.match(api,/tx\.create\(audit,change\)/);
 assert.match(api,/tx\.create\(reportEntry,\{/);
 assert.match(api,/type:'activiteit',reportCategory:'activiteit'/);
 assert.match(api,/tx\.create\(notice,\{/);
 assert.doesNotMatch(api,/tx\.delete\(/);
 const leave=contents('src/leave-routes.js');
 assert.match(leave,/requests\/:id\/retire/);
 assert.match(leave,/action:'cadre_retired'/);
 assert.match(leave,/writeLeaveEvent\(tx,/);
 const css=contents('public/bpd-dossier-shared.css');
 assert.match(css,/\.dossier-retire-button/);
 assert.match(css,/\.record:hover>\.dossier-retire-button/);
});
