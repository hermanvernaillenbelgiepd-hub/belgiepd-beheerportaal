import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANUAL_ROLE_CATALOG,manualRoleChoice,manualRoleLabel}
  from '../src/manual-role-catalog.js';

test('Service-specific cadre names are complete and map only to existing portal tiers',()=>{
 assert.deepEqual(MANUAL_ROLE_CATALOG.politie.map(x=>x.role),
   ['middenkader','officierenkader','korpsleiding']);
 assert.deepEqual(MANUAL_ROLE_CATALOG.ambulance.map(x=>x.role),
   ['middenkader','officierenkader','korpsleiding']);
 assert.match(manualRoleLabel('ambulance','middenkader'),/instructeur/i);
 assert.match(manualRoleLabel('ambulance','officierenkader'),/Ambulanceleiding/i);
 assert.match(manualRoleLabel('ambulance','korpsleiding'),/DIR-MED/);
 assert.match(manualRoleLabel('brandweer','officierenkader'),/Brandweerleiding/);
 assert.match(manualRoleLabel('brandweer','korpsleiding'),/ZONE/);
 assert.deepEqual(MANUAL_ROLE_CATALOG.depannage.map(x=>x.role),['korpsleiding']);
 assert.match(manualRoleLabel('depannage','korpsleiding'),/Agentschap Wegen en Verkeer/);
 assert.equal(manualRoleChoice('depannage','officierenkader'),null);
 assert.deepEqual(MANUAL_ROLE_CATALOG.burger.map(x=>x.role),['basiskader']);
 assert.match(manualRoleLabel('burger','basiskader'),/Burgerraad/);
 assert.equal(manualRoleChoice('burger','korpsleiding'),null);
 assert.equal(manualRoleChoice('ambulance','beheerder'),null);
});

test('Every service role accepted by the server is a known cadre, not a client-supplied Discord role',()=>{
 for(const [dept,options] of Object.entries(MANUAL_ROLE_CATALOG)){
   const names=new Set(),tiers=new Set();
   for(const {role,label} of options){
     assert.ok((dept==='burger'?['basiskader']:
       ['middenkader','officierenkader','korpsleiding']).includes(role));
     assert.equal(manualRoleChoice(dept,role)?.label,label);
     assert.ok(!tiers.has(role));assert.ok(!names.has(label));
     names.add(label);tiers.add(role);
   }
 }
});

test('Role recovery validates service-role combinations and exposes the same server catalogue to UI',()=>{
 const api=readFileSync(new URL('../src/manual-role-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 assert.match(api,/!manualRoleChoice\(body\.dept,body\.role\)/);
 assert.match(api,/roleCatalog:MANUAL_ROLE_CATALOG/);
 assert.match(api,/roleLabel:manualRoleLabel\(data\.dept,data\.role\)/);
 assert.match(api,/manualRoleRecovery:\{dept,role:request\.role/);
 assert.match(api,/citizenCouncilRecovery:\{dept:'burger',role:'basiskader'/);
 assert.match(page,/manualRoleCatalog=data\.roleCatalog\|\|null/);
 assert.match(page,/updateManualServiceRoleOptions/);
 assert.match(page,/item\.roleLabel\|\|roleNames\[item\.role\]/);
 assert.match(page,/Voor <strong>Burger → Burgerraad<\/strong>/);
});
