import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedManagedEntry,verifiedDiscordIdentity,validUserGrant,
  canSeeUser,canChangeUser,canBlockUser,isUserManager} from '../src/user-access.js';

const discordId='505659510359064606',guild='1309532437952466984',now=Date.UTC(2026,9,19);
const decoded={uid:'discord:'+discordId,bpdDiscord:true,bpdGuildId:guild,
  firebase:{sign_in_provider:'custom'}};
const member={guildId:guild,roleIds:['1335578488664490057'],
  verifiedAt:now-1000};
const officer={role:'officierenkader',departments:['politie'],discordId:'111111111111111111'};
const chief={role:'korpsleiding',departments:['politie'],discordId:'222222222222222222'};
const admin={role:'beheerder',departments:['politie'],discordId:'333333333333333333'};
const pending={status:'pending',candidateDepartments:['politie'],discordId,username:'Collega'};
const approved={status:'approved',role:'middenkader',departments:['politie'],discordId,
  departmentRoles:{politie:'middenkader'}};
const grant=validUserGrant({role:'middenkader',departments:['politie'],reason:'Geverifieerde politiecollega'});
test('Only fresh OAuth-verfied guild identities can request access',()=>{
  assert.equal(verifiedDiscordIdentity(decoded,member,guild,now,15*60*1000),discordId);
  assert.equal(verifiedDiscordIdentity({...decoded,bpdGuildId:'999999999999999999'},member,guild,now),null);
  assert.equal(verifiedDiscordIdentity({...decoded,bpdDiscord:false},member,guild,now),null);
  assert.equal(verifiedDiscordIdentity(decoded,{...member,verifiedAt:now-16*60*1000},guild,now,15*60*1000),null);
  assert.equal(verifiedDiscordIdentity(decoded,{...member,roleIds:['fake']},guild,now),null);
});
test('A pending, blocked or corrupt Firestore document never grants staff access',()=>{
  assert.equal(approvedManagedEntry({...approved,status:'pending'},discordId),null);
  assert.equal(approvedManagedEntry({...approved,status:'blocked'},discordId),null);
  assert.equal(approvedManagedEntry({...approved,discordId:'999999999999999999'},discordId),null);
  assert.equal(approvedManagedEntry({...approved,departmentRoles:{politie:'korpsleiding'}},discordId),null);
  assert.deepEqual(approvedManagedEntry(approved,discordId),{
    role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'},discordId});
});
test('Invalid, duplicate, elevated and reasonless grants are rejected',()=>{
  assert.throws(()=>validUserGrant({role:'beheerder',departments:['politie'],reason:'Beheerder maken'}));
  assert.throws(()=>validUserGrant({role:'officierenkader',departments:['politie','politie'],reason:'Gewone machtiging'}));
  assert.throws(()=>validUserGrant({role:'middenkader',departments:['politie'],reason:'kort'}));
  assert.deepEqual(grant.departmentRoles,{politie:'middenkader'});
});
test('Officer can approve middle cadre of own department, not promote or self-approve',()=>{
  assert.equal(isUserManager(officer),true);
  assert.equal(canChangeUser(officer,discordId,pending,grant),true);
  assert.equal(canChangeUser(officer,discordId,pending,validUserGrant({role:'officierenkader',departments:['politie'],reason:'Hoger kader aanvraag'})),false);
  assert.equal(canChangeUser(officer,officer.discordId,pending,grant),false);
  assert.equal(canChangeUser(officer,discordId,{...pending,candidateDepartments:['brandweer']},grant),false);
  assert.equal(canChangeUser(officer,discordId,approved,validUserGrant({role:'middenkader',departments:['brandweer'],reason:'Andere dienst toewijzen'})),false);
});
test('Korpsleiding may grant officer but not own rank; manager can grant chief, not beheerder',()=>{
  const officerGrant=validUserGrant({role:'officierenkader',departments:['politie'],reason:'Functie is bevestigd'});
  const chiefGrant=validUserGrant({role:'korpsleiding',departments:['politie'],reason:'Korpsleiding bevestigd'});
  assert.equal(canChangeUser(chief,discordId,pending,officerGrant),true);
  assert.equal(canChangeUser(chief,discordId,pending,chiefGrant),false);
  assert.equal(canChangeUser(admin,discordId,pending,chiefGrant),true);
  assert.equal(canChangeUser(officer,discordId,{...approved,role:'korpsleiding'},grant),false);
});
test('Managers only see own service; no self-block and higher cadre cannot be blocked',()=>{
  assert.equal(canSeeUser(officer,pending),true);
  assert.equal(canSeeUser(officer,{...pending,candidateDepartments:['ambulance']}),false);
  assert.equal(canSeeUser(admin,{...pending,candidateDepartments:[]}),true);
  assert.equal(canBlockUser(officer,discordId,approved),true);
  assert.equal(canBlockUser(officer,officer.discordId,approved),false);
  assert.equal(canBlockUser(officer,discordId,{...approved,role:'officierenkader'}),false);
  assert.equal(canBlockUser(chief,discordId,{...approved,role:'officierenkader'}),true);
});
