import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 RAGO_IO_DISCORD_ROLE
} from '../src/organogram-placement-policy.js';
import {
 RAGO_FULL_DISCORD_ROLE,RAGO_INSTRUCTOR_DISCORD_ROLE,
 verifiedRagoQualification,overlayVerifiedRagoItems,overlayVerifiedRagoRoster,
 suppressSupersededRagoMatches,RAGO_DISPLAY_ROLE_IDS
} from '../src/rago-qualification-display.js';
import {POLICE_ROLE_PATCH_PRESETS} from '../src/specialty-role-presets.js';
import {publicPoliceRoster} from '../src/member-dashboard-routes.js';
const guild='123456789012345678';
const actor='234567890123456789',now=Date.UTC(2026,10,1,20,0,0);
const proof=roles=>({guildId:guild,verifiedAt:now-60000,roleIds:roles});
const doc=(id,roles)=>({id,data:()=>proof(roles)});
const person=(id=actor)=>({personId:id,dept:'politie',call:'485',
 name:'Testmedewerker',rank:'Inspecteur',series:'Reeks 1',status:'Actief',
 specialties:[{label:'RAGO',value:'Nee',source:'google-sheets'},
  {label:'K9',value:'Nee',source:'google-sheets'}]});

test('RAGO IO role maps to AANGEMELD with a half-wing level, not full membership',()=>{
 assert.deepEqual(RAGO_DISPLAY_ROLE_IDS,[
  '1490841316656156802','1309532437977497700','1393050551188721865'
 ]);
 const state=verifiedRagoQualification(proof([RAGO_IO_DISCORD_ROLE]),guild,now);
 assert.equal(state.value,'AANGEMELD');
 assert.equal(state.roleId,RAGO_IO_DISCORD_ROLE);
 assert.match(state.level,/in opleiding/);
 const preset=POLICE_ROLE_PATCH_PRESETS.find(p=>p.roleId===RAGO_IO_DISCORD_ROLE);
 assert.equal(preset.value,'AANGEMELD');
});

test('full RAGO and instructor supersede IO role even if Discord still retains it',()=>{
 const full=verifiedRagoQualification(
  proof([RAGO_IO_DISCORD_ROLE,RAGO_FULL_DISCORD_ROLE]),guild,now);
 assert.equal(full.value,'Ja');
 assert.equal(full.roleId,RAGO_FULL_DISCORD_ROLE);
 const instructeur=verifiedRagoQualification(
  proof([RAGO_IO_DISCORD_ROLE,RAGO_FULL_DISCORD_ROLE,RAGO_INSTRUCTOR_DISCORD_ROLE]),guild,now);
 assert.equal(instructeur.value,'INSTRUCTEUR');
 assert.equal(instructeur.roleId,RAGO_INSTRUCTOR_DISCORD_ROLE);
});

test('stale or wrong-guild roles never fabricate an RAGO membership',()=>{
 assert.equal(verifiedRagoQualification(
  {...proof([RAGO_IO_DISCORD_ROLE]),verifiedAt:now-8*86400000},guild,now),null);
 assert.equal(verifiedRagoQualification(proof([RAGO_IO_DISCORD_ROLE]),'345678901234567890',now),null);
 assert.equal(verifiedRagoQualification(proof(['garbled']),guild,now),null);
 assert.equal(verifiedRagoQualification(proof([]),guild,now),null);
});

test('roster projection respects manual restrictions and does not mutate the source',()=>{
 const source=person(),other={...person('345678901234567890'),dept:'ambulance'};
 const docs=[doc(actor,[RAGO_IO_DISCORD_ROLE]),doc(other.personId,[RAGO_IO_DISCORD_ROLE])];
 const out=overlayVerifiedRagoRoster([source,other],docs,guild,now);
 assert.equal(out[0].specialties.find(s=>s.label==='RAGO').value,'AANGEMELD');
 assert.equal(out[0].specialties.find(s=>s.label==='RAGO').source,'discord-verified');
 assert.equal(out[1].specialties.find(s=>s.label==='RAGO').value,'Nee');
 assert.equal(source.specialties[0].value,'Nee');
 const restricted=person();
 restricted.specialties[0]={label:'RAGO',value:'RESTRICTED',source:'manual'};
 const restrictedResult=overlayVerifiedRagoRoster([restricted],docs,guild,now);
 assert.equal(restrictedResult[0].specialties[0].value,'RESTRICTED');
});

test('verified trainee and upgrade reach the ordinary public personnel roster',()=>{
 const original=person();
 const stage=overlayVerifiedRagoRoster([original],[doc(actor,[RAGO_IO_DISCORD_ROLE])],guild,now);
 const upgraded=overlayVerifiedRagoRoster([original],[
  doc(actor,[RAGO_IO_DISCORD_ROLE,RAGO_FULL_DISCORD_ROLE])
 ],guild,now);
 const display=(records)=>publicPoliceRoster(records)[0].specialties.find(s=>s.label==='RAGO').value;
 assert.equal(display(stage),'AANGEMELD');
 assert.equal(display(upgraded),'Ja');
});

test('only one RAGO role badge remains when user is promoted',()=>{
 const mk=roleId=>({label:'RAGO',roleId,value:'Stage',assetKey:roleId+'_standard'});
 const others={label:'K9',roleId:'1309532437977497699',value:'Ja',assetKey:''};
 const onlyIo=suppressSupersededRagoMatches([mk(RAGO_IO_DISCORD_ROLE)]);
 assert.equal(onlyIo[0].value,'AANGEMELD');
 const both=suppressSupersededRagoMatches([
  mk(RAGO_IO_DISCORD_ROLE),others,mk(RAGO_FULL_DISCORD_ROLE)
 ]);
 assert.equal(both.length,2);
 assert.equal(both.find(x=>x.label==='RAGO').roleId,RAGO_FULL_DISCORD_ROLE);
 const instructor=suppressSupersededRagoMatches([
  mk(RAGO_IO_DISCORD_ROLE),mk(RAGO_FULL_DISCORD_ROLE),mk(RAGO_INSTRUCTOR_DISCORD_ROLE)
 ]);
 assert.equal(instructor.length,1);
 assert.equal(instructor[0].roleId,RAGO_INSTRUCTOR_DISCORD_ROLE);
});

test('all major RAGO displays derive from one verified role projection, not spreadsheet writes',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../src/specialization-routes.js',import.meta.url),'utf8');
 const linked=readFileSync(new URL('../src/specialty-role-link-routes.js',import.meta.url),'utf8');
 assert.match(server,/overlayVerifiedRagoRoster\(visible,roleDocs\.docs/);
 assert.match(dossier,/overlayVerifiedRagoItems\(state\.items,rago\)/);
 assert.match(linked,/matches:suppressSupersededRagoMatches\(linked\)/);
 assert.doesNotMatch(server,/setCustomUserClaims/);
});

test('MAIN roster verifies RAGO roles even when optional specialization register is off',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/if\(process\.env\.DISCORD_GUILD_ID\)\{/);
 assert.doesNotMatch(server,/if\(specialties\s*&&\s*process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(server,/visible=overlayVerifiedRagoRoster\(visible,roleDocs\.docs/);
 // A sheet-only personnel record must still accept a recently verified role,
 // without changing the Sheets source or granting operational authorization.
 const source=person();
 const out=overlayVerifiedRagoRoster([source],[doc(actor,[RAGO_IO_DISCORD_ROLE])],guild,now);
 assert.equal(out[0].specialties.find(s=>s.label==='RAGO').value,'AANGEMELD');
 assert.equal(source.specialties.find(s=>s.label==='RAGO').value,'Nee');
});
