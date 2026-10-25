import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isVerifiedTechnicalRoleApprover,manualRoleDecisionScope}
  from '../src/manual-role-decision-policy.js';

const OWNER='111111111111111111',COLLEAGUE='222222222222222222';
const tech={uid:'discord:'+OWNER,discordId:OWNER,role:'beheerder',
 portalTechnicalMode:true,profileTechnicalAvailable:true};
const officer={uid:'discord:'+OWNER,discordId:OWNER,role:'officierenkader',
 portalTechnicalMode:false,profileTechnicalAvailable:false};
const ownRequest={requestedBy:'discord:'+OWNER};

test('Only a server-verified technical session may review its own request for another member',()=>{
 assert.equal(isVerifiedTechnicalRoleApprover(tech),true);
 assert.deepEqual(manualRoleDecisionScope(tech,ownRequest,COLLEAGUE),
   {allowed:true,technicalOverride:true});
 for(const actor of [officer,
   {...tech,portalTechnicalMode:false},
   {...tech,profileTechnicalAvailable:false},
   {...tech,role:'officierenkader'},
   {...tech,uid:'discord:999999999999999999'},
   {...tech,discordId:'not-a-valid-discord-id'}]){
   assert.equal(isVerifiedTechnicalRoleApprover(actor),false);
   assert.equal(manualRoleDecisionScope(actor,ownRequest,COLLEAGUE).allowed,false);
 }
});

test('Technical administrator can never self-grant a cadre role, regardless of who requested it',()=>{
 assert.equal(manualRoleDecisionScope(tech,{requestedBy:'discord:'+COLLEAGUE},OWNER).allowed,false);
 assert.equal(manualRoleDecisionScope(tech,ownRequest,OWNER).allowed,false);
 assert.equal(manualRoleDecisionScope(tech,ownRequest,'bad-id').allowed,false);
});

test('Independent approvers keep existing rights; ordinary applicants require separation',()=>{
 assert.deepEqual(manualRoleDecisionScope(officer,ownRequest,COLLEAGUE),
   {allowed:false,technicalOverride:false});
 assert.deepEqual(manualRoleDecisionScope(officer,{requestedBy:'discord:'+COLLEAGUE},'333333333333333333'),
   {allowed:true,technicalOverride:false});
});

test('Server uses the scope for the transaction, preserves Discord proof and audits technical solo approvals',()=>{
 const route=readFileSync(new URL('../src/manual-role-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/technicalCookieIsValid\(/);
 assert.match(server,/technicalActor\(actor\)/);
 assert.match(route,/canSoloApprove:access\.manager&&isVerifiedTechnicalRoleApprover\(req\.bpd\)/);
 assert.match(route,/manualRoleDecisionScope\(req\.bpd,request,discordId\)/);
 assert.match(route,/if\(!scope\.allowed\)/);
 assert.match(route,/!freshGuildMember\(verified\.data\(\),process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(route,/!canChangeUser\(req\.bpd,discordId,candidate/);
 assert.match(route,/manualRoleRecovery:\{dept,role:request\.role,approvedBy:req\.bpd\.uid/);
 assert.match(route,/approvalMethod:scope\.technicalOverride\?/);
 assert.match(route,/tx\.create\(ref\.collection\('audit'\)\.doc\(\),\{action:decision/);
});

test('UI clearly identifies the exception and confirms privilege-changing action',()=>{
 const ui=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 assert.match(ui,/data\.canSoloApprove/);
 assert.match(ui,/if\(ownRequest&&!solo\)/);
 assert.match(ui,/if\(decision==='approved'&&!confirm\(/);
 assert.match(ui,/via de technische uitzonderingsbevoegdheid/);
});
