import test from 'node:test';
import assert from 'node:assert/strict';
import { discordPortalAccess, DISCORD_PORTAL_MAX_AGE_MS } from '../src/discord-portal-access.js';
const now=Date.UTC(2026,9,19);
const discordId='505659510359064606',guildId='123456789012345678';
const token={uid:'discord:'+discordId,bpdDiscord:true,bpdGuildId:guildId,firebase:{sign_in_provider:'custom'}};
const staff={'someone@example.com':{discordId,role:'officierenkader',departments:['politie']}};
const member={guildId,verifiedAt:now-1000,roleIds:['999999999999999999']};
test('a previously verified, uniquely mapped Discord login keeps its approved role',()=>{
  const result=discordPortalAccess(token,staff,member,guildId,now);
  assert.equal(result?.entry.role,'officierenkader');
  assert.equal(result?.email,'someone@example.com');
  assert.equal(result?.discordId,discordId);
});
test('Discord member without an explicit allowlist record gets no staff rights',()=>{
  assert.equal(discordPortalAccess(token,{},member,guildId,now),null);
});
test('One Discord ID cannot be shared by two Google accounts',()=>{
  const duplicate={...staff,'other@example.com':{...staff['someone@example.com']}};
  assert.equal(discordPortalAccess(token,duplicate,member,guildId,now),null);
});
test('Reject a different guild, spoofed token, and unsigned role assertions',()=>{
  assert.equal(discordPortalAccess({...token,bpdDiscord:false},staff,member,guildId,now),null);
  assert.equal(discordPortalAccess({...token,bpdGuildId:'234567890123456789'},staff,member,guildId,now),null);
  assert.equal(discordPortalAccess(token,staff,{...member,guildId:'234567890123456789'},guildId,now),null);
  assert.equal(discordPortalAccess({...token,firebase:{sign_in_provider:'google.com'}},staff,member,guildId,now),null);
});
test('Stored browser session never extends Discord membership verification indefinitely',()=>{
  assert.equal(discordPortalAccess(token,staff,{...member,verifiedAt:now-DISCORD_PORTAL_MAX_AGE_MS-1},guildId,now),null);
  assert.ok(discordPortalAccess(token,staff,{...member,verifiedAt:now-DISCORD_PORTAL_MAX_AGE_MS},guildId,now));
  assert.equal(discordPortalAccess(token,staff,{...member,verifiedAt:now+120000},guildId,now),null);
});
