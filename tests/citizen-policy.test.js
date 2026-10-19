import test from 'node:test';
import assert from 'node:assert/strict';
import {citizenDossiersEnabled,verifiedCitizenId,citizenKey,
  citizenInitialData,publicCitizenProfile} from '../src/citizen-policy.js';

const discordId='123456789012345678',guildId='888888888888888888';
const now=Date.UTC(2026,9,20,12);
const member={guildId,roleIds:[],verifiedAt:now-1000,username:'Citizen'};
const verified={uid:'discord:'+discordId,bpdDiscord:true,bpdGuildId:guildId,
  firebase:{sign_in_provider:'custom'}};
test('Citizen dossiers are explicitly disabled unless configured',()=>{
  assert.equal(citizenDossiersEnabled({}),false);
  assert.equal(citizenDossiersEnabled({BPD_ENABLE_CITIZEN_DOSSIERS:'false'}),false);
  assert.equal(citizenDossiersEnabled({BPD_ENABLE_CITIZEN_DOSSIERS:'true'}),true);
});
test('Citizen registration accepts only a recent and valid Discord OAuth identity',()=>{
  assert.equal(verifiedCitizenId(verified,member,guildId,now),discordId);
  assert.equal(verifiedCitizenId({...verified,bpdDiscord:false},member,guildId,now),null);
  assert.equal(verifiedCitizenId({...verified,uid:'discord:999999999999999999'},member,'777777777777777777',now),null);
  assert.equal(verifiedCitizenId({...verified,firebase:{sign_in_provider:'google.com'}},member,guildId,now),null);
  assert.equal(verifiedCitizenId(verified,{...member,verifiedAt:now-16*60000},guildId,now),null);
  assert.equal(verifiedCitizenId(verified,{...member,guildId:'777777777777777777'},guildId,now),null);
});
test('Citizen record IDs and sources cannot be supplied arbitrarily',()=>{
  assert.equal(citizenKey(discordId),discordId);
  for(const invalid of ['arbitrary','discord:'+discordId,'',null,123])assert.throws(()=>citizenKey(invalid));
  assert.throws(()=>citizenInitialData(discordId,'user_reported'));
  const fromDiscord=citizenInitialData(discordId,'discord_oauth','Alice');
  assert.deepEqual(fromDiscord,{
    discordId,origin:'discord_oauth',displayName:'Alice',category:'burger',state:'registered'
  });
  const fromBot=citizenInitialData(discordId,'trusted_fivem_server');
  assert.equal(fromBot.displayName,'');
  assert.equal(Object.hasOwn(fromBot,'role'),false);
  assert.equal(Object.hasOwn(fromBot,'playHours'),false);
  assert.equal(Object.hasOwn(fromBot,'firstServerJoinAt'),false);
});
test('Citizen dossier projection never leaks secrets, internal permissions or audit',()=>{
  const raw={...citizenInitialData(discordId,'trusted_fivem_server','Game member'),
    createdAt:new Date('2026-10-20T12:00:00Z'),
    updatedAt:new Date('2026-10-20T13:00:00Z'),
    secret:'FORBIDDEN',departmentRoles:{politie:'korpsleiding'},audit:['secret']};
  const result=publicCitizenProfile(raw,discordId);
  assert.deepEqual(result,{
    discordId,displayName:'Game member',origin:'trusted_fivem_server',
    registeredAt:'2026-10-20T12:00:00.000Z',updatedAt:'2026-10-20T13:00:00.000Z'
  });
  assert.equal(publicCitizenProfile({...raw,discordId:'999999999999999999'},discordId),null);
  assert.equal(publicCitizenProfile({...raw,state:'inactive'},discordId),null);
  assert.equal(publicCitizenProfile({...raw,category:'politie'},discordId),null);
});
