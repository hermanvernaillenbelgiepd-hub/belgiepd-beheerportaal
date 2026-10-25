import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANUAL_ROLE_CATALOG,manualRoleLabel} from '../src/manual-role-catalog.js';
import {verifiedFireZoneChief} from '../src/service-dossier-access.js';

const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/user-routes.js',import.meta.url),'utf8');

test('An existing Brandweer korpsleiding account shows ZONE explicitly in central administration',()=>{
 const fire=MANUAL_ROLE_CATALOG.brandweer;
 assert.equal(manualRoleLabel('brandweer','korpsleiding'),'ZONE – Zonecommandant');
 assert.equal(fire.find(x=>x.role==='korpsleiding')?.label,'ZONE – Zonecommandant');
 assert.match(html,/setAccountCadreOptions\(rank,dept\.value,selectedRole\)/);
 assert.match(html,/const selectedRole=isBoard\?'bestuur':accountDepartmentRole\(dept\.value\)\|\|'basiskader'/);
 assert.match(html,/accountRoleCatalog=data\.roleCatalog\|\|null/);
 assert.match(route,/roleCatalog:MANUAL_ROLE_CATALOG/);
 assert.match(route,/departmentRoles:d\.status==='approved'/);
});

test('Changing the service selects its own cadre rather than carrying a police rank across services',()=>{
 assert.match(html,/const previous=accountDepartmentRole\(dept\.value\)/);
 assert.match(html,/setAccountCadreOptions\(rank,dept\.value,isBoard\?'bestuur':previous\|\|'basiskader'\)/);
 assert.match(html,/function accountCadreLabel\(dept,role\)/);
 for(const dept of ['politie','ambulance','brandweer','depannage'])
   assert.ok(MANUAL_ROLE_CATALOG[dept]?.length);
 assert.equal(manualRoleLabel('ambulance','korpsleiding').includes('DIR-MED'),true);
 assert.equal(manualRoleLabel('depannage','korpsleiding').includes('AWV'),true);
});

test('ZONE selection remains a portal rank, not an authorization bypass',()=>{
 assert.match(html,/ZONE – Zonecommandant selecteren\?/);
 assert.match(html,/officiële ZONE-functie en volledige brandweerbevoegdheid vereisen daarnaast/);
 assert.match(html,/role:rank\.value,departments:\[dept\.value\],reason/);
 const actor={uid:'discord:301448301868220417',discordId:'301448301868220417',
   departments:['brandweer'],role:'korpsleiding',portalTechnicalMode:false};
 const roster=[{dept:'brandweer',personId:actor.discordId,call:'BWM-12'}];
 const now=Date.UTC(2026,9,25,16,0,0),guildId='1309532438053130326';
 const member={guildId,verifiedAt:now-60*1000,roleIds:[]};
 assert.equal(verifiedFireZoneChief(actor,roster,member,guildId,now),false);
 assert.equal(verifiedFireZoneChief(actor,[{...roster[0],call:'ZONE'}],member,guildId,now),true);
});
