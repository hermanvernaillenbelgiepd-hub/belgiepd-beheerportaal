import test from 'node:test';
import assert from 'node:assert/strict';
import {linkEnabled,validateLinkReference,verifiedLinkRequester,mayApproveLink,mayRejectLink,bearerToken} from '../src/personnel-link.js';
import {visiblePendingPersonnel,validateNewPersonnel} from '../src/personnel-create.js';
const discordId='505659510359064606',guild='1309532437952466984',now=Date.UTC(2026,9,19,16,0);
const officer={role:'officierenkader',discordId:'111111111111111111',
  departments:['politie'],departmentRoles:{politie:'officierenkader'}};
const member={guildId:guild,verifiedAt:now-1000,roleIds:['1473474238664020151']};
const record={dept:'politie',discordId:null,name:'Fictieve Medewerker',call:'TEST-P550',
  rank:'Inspecteur',state:'awaiting_discord',
  linkRequest:{state:'awaiting_approval',discordId,username:'Test Discord',
    verifiedAt:now-1000}};
test('Pilot-only link feature never runs in production',()=>{
 const env={BPD_TEST_FIXTURES:'true',FIREBASE_PROJECT_ID:'belgiepd-test',
   BPD_ENABLE_PERSONNEL_CREATION:'true',BPD_ENABLE_PERSONNEL_WRITES:'true'};
 assert.equal(linkEnabled(env),true);
 for(const changes of [{FIREBASE_PROJECT_ID:'belgiepd-prod'},
   {BPD_TEST_FIXTURES:'false'},{BPD_ENABLE_PERSONNEL_CREATION:'false'},
   {BPD_ENABLE_PERSONNEL_WRITES:'false'}]){
    assert.equal(linkEnabled({...env,...changes}),false);
 }
});
test('Personnel Discord request accepts a valid Firebase Bearer token header',()=>{
 assert.equal(bearerToken('Bearer eyJhbGciOiJSUzI1NiJ9.token.signature'),
   'eyJhbGciOiJSUzI1NiJ9.token.signature');
 assert.equal(bearerToken(''),null);
 assert.equal(bearerToken('Bearer '),null);
 assert.equal(bearerToken('Basic credentials'),null);
 assert.equal(bearerToken('Bearer abc def'),null);
});
test('Only valid generated personnel references are accepted',()=>{
 assert.equal(validateLinkReference('aBcDefGhiJKlmNop1234'),true);
 assert.equal(validateLinkReference('../secrets'),false);
 assert.equal(validateLinkReference(''),false);
 assert.equal(validateLinkReference('a'.repeat(41)),false);
});
test('Discord member must have authenticated through own valid custom Firebase token',()=>{
 const decoded={uid:'discord:'+discordId,bpdDiscord:true,bpdGuildId:guild,
   firebase:{sign_in_provider:'custom'}};
 assert.equal(verifiedLinkRequester(decoded,member,guild,now),discordId);
 assert.equal(verifiedLinkRequester({...decoded,bpdDiscord:false},member,guild,now),null);
 assert.equal(verifiedLinkRequester({...decoded,uid:'discord:999999999999999999'},member,
   '999999999999999999',now),null);
 assert.equal(verifiedLinkRequester(decoded,{...member,verifiedAt:now-20*60*1000},guild,now),null);
});
test('Only officer of owning service may approve an independently verified member',()=>{
 assert.equal(mayApproveLink(officer,record,member,guild,now),true);
 assert.equal(mayApproveLink({...officer,role:'middenkader'},record,member,guild,now),false);
 assert.equal(mayApproveLink({...officer,discordId},record,member,guild,now),false);
 assert.equal(mayApproveLink(officer,{...record,state:'linked'},member,guild,now),false);
 assert.equal(mayApproveLink(officer,{...record,linkRequest:{...record.linkRequest,state:'rejected'}},member,guild,now),false);
 assert.equal(mayApproveLink(officer,record,{...member,verifiedAt:now-8*24*60*60*1000},guild,now),false);
 assert.equal(mayApproveLink(officer,record,{...member,guildId:'999999999999999999'},guild,now),false);
 assert.equal(mayApproveLink(officer,record,{...member,roleIds:['invalid']},guild,now),false);
});
test('A permitted cadre member can reject a self-claim without approving it',()=>{
 const selfOfficer={...officer,discordId};
 assert.equal(mayApproveLink(selfOfficer,record,member,guild,now),false);
 assert.equal(mayRejectLink(selfOfficer,record),true);
 assert.equal(mayRejectLink({...officer,role:'middenkader'},record),false);
 assert.equal(mayRejectLink({...officer,departments:['brandweer'],
    departmentRoles:{brandweer:'officierenkader'}},record),false);
 assert.equal(mayRejectLink(selfOfficer,{...record,state:'linked'}),false);
 assert.equal(mayRejectLink(selfOfficer,{...record,discordId}),false);
 assert.equal(mayRejectLink(selfOfficer,{...record,linkRequest:null}),false);
 assert.equal(mayRejectLink(selfOfficer,{...record,linkRequest:{...record.linkRequest,state:'rejected'}}),false);
});
test('Missing Discord ID remains pending and never becomes active on member lists',()=>{
 const pending=validateNewPersonnel({dept:'politie',name:'Fictieve Medewerker',call:'TEST-P550',
   rank:'Inspecteur',reason:'Personeelsadministratie testen',discordId:''});
 assert.equal(pending.discordId,null);
 const draft=visiblePendingPersonnel('aBcDefGhiJKlmNop1234',{...pending,state:'awaiting_discord',
    linkRequest:{...record.linkRequest}});
 assert.equal(draft.request.discordId,discordId);
 assert.equal(draft.status,'Wacht op kadergoedkeuring');
 assert.equal(visiblePendingPersonnel('aBcDefGhiJKlmNop1234',{...pending,state:'linked'}),null);
});
