import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLegacyPoliceOfficer,OFFICER_DISCORD_ROLE} from '../src/legacy-officer-reconciliation.js';
const id='505659510359064606',guild='1309532437952466984',now=Date.UTC(2026,9,19);
const legacy={role:'officierenkader',departments:['politie','brandweer'],departmentRoles:{politie:'middenkader',brandweer:'basiskader'},discordId:id};
const member={guildId:guild,verifiedAt:now-1000,roleIds:[OFFICER_DISCORD_ROLE]};
const staff=[{dept:'politie',personId:id,rank:'Aspirant Commissaris van Politie (ACP)'}];
test('Only three-way verified police officer mismatch can be reconciled',()=>{
 const updated=reconcileLegacyPoliceOfficer(legacy,id,member,staff,guild,now);
 assert.equal(updated?.departmentRoles.politie,'officierenkader');
 assert.equal(updated?.departmentRoles.brandweer,'basiskader');
 assert.equal(legacy.departmentRoles.politie,'middenkader');
});
test('Unverified Discord officer, expired member, wrong guild, or wrong rank do not elevate',()=>{
 assert.equal(reconcileLegacyPoliceOfficer(legacy,id,{...member,roleIds:['1335578488664490057']},staff,guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer(legacy,id,{...member,verifiedAt:now-16*60*1000},staff,guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer(legacy,id,{...member,guildId:'123456789012345678'},staff,guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer(legacy,id,member,[{...staff[0],rank:'Hoofdinspecteur (HINP)'}],guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer(legacy,id,member,[...staff,...staff],guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer(legacy,id,member,[],guild,now),null);
});
test('No general officer assignment or explicit middle-cadre department keeps old rights',()=>{
 assert.equal(reconcileLegacyPoliceOfficer({...legacy,role:'middenkader'},id,member,staff,guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer({...legacy,departmentRoles:{politie:'basiskader'}},id,member,staff,guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer({...legacy,departments:['brandweer']},id,member,staff,guild,now),null);
 assert.equal(reconcileLegacyPoliceOfficer(legacy,'123456789012345678',member,staff,guild,now),null);
});
