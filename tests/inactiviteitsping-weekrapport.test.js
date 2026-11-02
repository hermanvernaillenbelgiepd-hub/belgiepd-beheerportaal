import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANAGEMENT_TYPES,RECORD_LABELS,mayWriteManagement,
  validateManagementEntry,reportSections} from '../src/management-utils.js';

const actor=role=>({uid:'discord:111111111111111111',
 role,discordId:'111111111111111111',
 departments:['politie','brandweer','ambulance','depannage'],
 departmentRoles:{politie:role,brandweer:role,ambulance:role,depannage:role},
 dossierAllowedDepartments:['politie','brandweer','ambulance','depannage'],
 dossierNativeDepartments:['politie','brandweer','ambulance','depannage']});

test('Inactiviteitsping is a distinct audited case type across department scopes',()=>{
 assert.ok(MANAGEMENT_TYPES.includes('inactiviteitsping'));
 assert.equal(RECORD_LABELS.inactiviteitsping,'Inactiviteitsping');
 const event=validateManagementEntry({type:'inactiviteitsping',
  eventDate:'2026-11-02',details:'Inactiviteit gecontroleerd; opvolging gevraagd.'});
 assert.equal(event.type,'inactiviteitsping');
 assert.equal(event.reportCategory,'inactiviteitsping');
 assert.equal(event.eventDate,'2026-11-02');
 for(const dept of ['politie','brandweer','ambulance','depannage'])
  assert.equal(mayWriteManagement(actor('middenkader'),dept,'inactiviteitsping'),true,dept);
 assert.equal(mayWriteManagement(actor('basiskader'),'politie','inactiviteitsping'),false);
 assert.equal(mayWriteManagement(actor('middenkader'),'burger','inactiviteitsping'),false);
});
test('The two-week report retains a dedicated inactivity ping section, with source actor',()=>{
 const entry={type:'inactiviteitsping',eventDate:'2026-11-02',
  details:'Inactiviteitsping gecontroleerd',registeredBy:{name:'Kaderlid',call:'700'}};
 const sections=reportSections([entry],'2026-10-26','2026-11-08');
 const list=sections.find(x=>x.type==='inactiviteitsping');
 assert.equal(list.label,'Inactiviteitsping');
 assert.equal(list.entries.length,1);
 assert.equal(list.entries[0].registeredBy.call,'700');
});
test('Dossier dropdown and important notes include the new category without auto ping',()=>{
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 assert.match(page,/case:inactiviteitsping/);
 assert.match(page,/inactiviteitsping:'Inactiviteitsping'/);
 assert.match(page,/\['notitie','specialisatiebeperking','inactiviteitsping'\]/);
 assert.match(page,/niet automatisch een Discord-bericht verstuurd/);
 assert.match(route,/reportSections\(result,report\.periodStart,report\.periodEnd\)/);
 assert.match(route,/collection\('bpd_cases'\)/);
});
