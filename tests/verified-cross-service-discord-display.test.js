import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedSyncRoles,verifiedOtherServiceDiscordRoles}
 from '../src/organogram-placement-policy.js';

const guild='1309532438053130324';
const now=Date.UTC(2026,10,3,5);
const proof=(roleIds,at=now)=>({guildId:guild,verifiedAt:at,roleIds});
const RAGO='1309532437977497700';
const RAGO_IO='1490841316656156802';
const FAST='1309532438019706970';
const LSRA='1309532438019706971';
const BW='1309532438053130324';

test('one multi-service Discord member is displayed in the correct services without creating records',()=>{
 const member=proof([RAGO,FAST,LSRA,BW]);
 assert.deepEqual(verifiedSyncRoles(member,'brandweer',guild,now).specialties,[]);
 assert.deepEqual(verifiedSyncRoles(member,'politie',guild,now).specialties,['RAGO']);
 assert.deepEqual(verifiedSyncRoles(member,'depannage',guild,now).specialties,['F.A.S.T','LSRA']);
 const summary=verifiedOtherServiceDiscordRoles(member,'brandweer',guild,now);
 assert.deepEqual(summary,[
  {dept:'politie',labels:['RAGO']},
  {dept:'depannage',labels:['F.A.S.T','LSRA']}
 ]);
 assert.equal(summary.some(x=>x.dept==='brandweer'),false);
});

test('unverified, stale, wrong-guild or malformed claims cannot create other-service labels',()=>{
 const member=proof([RAGO,FAST,LSRA]);
 for(const invalid of [null,{...member,guildId:'wrong'},
  proof([RAGO],now-8*86400000),proof([RAGO,'not-a-discord-id'])]){
  assert.deepEqual(verifiedOtherServiceDiscordRoles(invalid,'brandweer',guild,now),[]);
 }
 assert.deepEqual(verifiedOtherServiceDiscordRoles(member,'invalid-dept',guild,now),[]);
 assert.deepEqual(verifiedOtherServiceDiscordRoles(member,'brandweer','invalid-guild',now),[]);
});

test('full RAGO supersedes historical trainee; other-service roles never become Brandweer qualifications',()=>{
 const member=proof([RAGO_IO,RAGO,FAST]);
 assert.deepEqual(verifiedSyncRoles(member,'brandweer',guild,now).specialties,[]);
 assert.deepEqual(verifiedOtherServiceDiscordRoles(member,'brandweer',guild,now),
  [{dept:'politie',labels:['RAGO']},{dept:'depannage',labels:['F.A.S.T']}]);
 assert.deepEqual(verifiedSyncRoles(proof([RAGO_IO]),'politie',guild,now).specialties,['RAGO-IO']);
});

test('organogram role projection remains display-only without exposing raw Discord IDs',()=>{
 const server=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(server,/otherServiceRoles:verifiedOtherServiceDiscordRoles\(/);
 assert.match(html,/Discord-functies bij andere diensten/);
 assert.match(html,/Deze Discord-rollen zijn geen specialisaties van deze dienst/);
 assert.match(html,/x\.dept!==p\.dept/);
 assert.doesNotMatch(html,/otherServiceRoles:.*roleIds/);
});
