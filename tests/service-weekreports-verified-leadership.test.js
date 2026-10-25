import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedServiceReportRoles,deriveServiceDossierDepartments} from '../src/service-dossier-access.js';
import {mayReadFortnightReport,fortnightReportDepartments} from '../src/fortnight-report-policy.js';

const ID='444444444444444444', GUILD='1309532438053130326';
const AZLS='1309532438053130325', AWV='1309532438019706969';
const NOW=Date.UTC(2026,9,25,15,0,0);
const actor={uid:'discord:'+ID,discordId:ID,role:'officierenkader',
 departments:['politie','ambulance','brandweer','depannage'],
 departmentRoles:{politie:'officierenkader',ambulance:'basiskader',
 brandweer:'basiskader',depannage:'basiskader'}};
const roster=[
 {dept:'politie',personId:ID,call:'920',rank:'Aspirant Commissaris'},
 {dept:'ambulance',personId:ID,call:'AMB-105',rank:'Ambulancier'},
 {dept:'brandweer',personId:ID,call:'BW-05',rank:'Brandweerman'},
 {dept:'depannage',personId:ID,call:'LSRA-12',rank:'Depannage'}
];
const guildRoles=ids=>({guildId:GUILD,roleIds:ids,verifiedAt:NOW-60000});

test('A police officer with ambulance membership cannot read medical, fire or towing reports',()=>{
 const medical={...actor,dossierAllowedDepartments:['politie','ambulance']};
 const allowed=fortnightReportDepartments(medical,roster);
 assert.deepEqual(allowed,['politie']);
 for(const dept of ['ambulance','brandweer','depannage'])
   assert.equal(mayReadFortnightReport(medical,dept,roster),false);
});

test('Only fresh AZLS Discord role or verified DIRMED duty authorizes ambulance reports',()=>{
 const evidence=verifiedServiceReportRoles(actor,guildRoles([AZLS]),GUILD,NOW);
 assert.equal(evidence.ambulanceAzls,true);
 const azls={...actor,reportServiceRoles:evidence};
 assert.equal(mayReadFortnightReport(azls,'ambulance',roster),true);
 assert.equal(deriveServiceDossierDepartments(actor,roster,guildRoles([AZLS]),null,GUILD,NOW).includes('ambulance'),true);
 const med=[...roster.filter(p=>p.dept!=='ambulance'),
  {dept:'ambulance',personId:ID,call:'DIRMED',rank:'Directeur Medisch'}];
 assert.equal(mayReadFortnightReport(actor,'ambulance',med),true);
 assert.equal(mayReadFortnightReport(actor,'ambulance',
  med.concat({dept:'ambulance',personId:ID,call:'AMB-2'})),false);
 assert.equal(mayReadFortnightReport({...actor,uid:'discord:999999999999999999'},'ambulance',med),false);
 for(const bad of [guildRoles([]),{...guildRoles([AZLS]),guildId:'111111111111111111'},
   {...guildRoles([AZLS]),verifiedAt:NOW-16*60000}]){
   assert.equal(verifiedServiceReportRoles(actor,bad,GUILD,NOW).ambulanceAzls,false);
 }
});

test('AWV report access works with real AWV duty or authenticated role, not police cadre',()=>{
 assert.equal(mayReadFortnightReport(actor,'depannage',roster),false);
 const evidence=verifiedServiceReportRoles(actor,guildRoles([AWV]),GUILD,NOW);
 assert.equal(evidence.depannageAwv,true);
 assert.equal(mayReadFortnightReport({...actor,reportServiceRoles:evidence},'depannage',roster),true);
 assert.equal(deriveServiceDossierDepartments(actor,roster,guildRoles([AWV]),null,GUILD,NOW).includes('depannage'),true);
 const actual=[...roster.filter(p=>p.dept!=='depannage'),
  {dept:'depannage',personId:ID,call:'AWV-01',rank:'AWV leiding'}];
 assert.equal(mayReadFortnightReport(actor,'depannage',actual),true);
 assert.equal(mayReadFortnightReport({...actor,uid:'not-discord'},'depannage',actual),false);
});

test('Brandweer report is restricted to the verified Zonechef and cannot be inherited',()=>{
 assert.equal(mayReadFortnightReport(actor,'brandweer',roster),false);
 assert.equal(mayReadFortnightReport({...actor,fireZoneChief:true},'brandweer',roster),true);
 assert.equal(mayReadFortnightReport({...actor,fireZoneChief:true,
  departments:['politie','ambulance','depannage']},'brandweer',roster),false);
 const different=[...roster.filter(p=>p.dept!=='brandweer'),
   {dept:'brandweer',personId:'999999999999999999',call:'ZONE'}];
 assert.equal(mayReadFortnightReport({...actor,fireZoneChief:true},'brandweer',different),false);
});

test('Every report endpoint checks service-specific access server-side',()=>{
 const source=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/req\.bpd\.reportServiceRoles=verifiedServiceReportRoles\(/);
 assert.match(source,/reportDepartments:fortnightReportDepartments\(/);
 assert.match(source,/!mayReadFortnightReport\(req\.bpd,dept,snapshot\.data\)/);
 assert.match(source,/!mayReadFortnightReport\(req\.bpd,report\.dept,snap\.data\)/);
});
