import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {developerViewerGrantState,developerViewerNewExpiry,
 validateDeveloperViewerChange} from '../src/developer-viewer-grants.js';
import {developerViewerEligible,readOnlyDeveloperRequestAllowed}
 from '../src/developer-readonly-profile.js';
import {mayEditTechnicalSettings} from '../src/technical-center-config.js';
const id='298799630458552323',guild='123456789012345678';
const now=new Date('2026-11-24T12:00:00Z');
const env={BPD_DEVELOPER_VIEWER_IDS:id,BPD_DEVELOPER_VIEWER_UNTIL:'2027-01-31',
 DISCORD_GUILD_ID:guild};
const decoded={uid:'discord:'+id,firebase:{sign_in_provider:'custom'},
 bpdDiscord:true,bpdGuildId:guild};
const member={guildId:guild,roleIds:[],verifiedAt:now.valueOf()-60000};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('UIT overrides legacy Render allowlist immediately; AAN restores bounded grant',()=>{
 const legacy=developerViewerGrantState(id,null,env,now);
 assert.equal(legacy.enabled,true);
 assert.equal(legacy.source,'environment');
 assert.equal(legacy.revision,0);
 const disabled={discordId:id,enabled:false,expiresOn:'2027-01-31',revision:1};
 const off=developerViewerGrantState(id,disabled,env,now);
 assert.equal(off.enabled,false);
 assert.equal(off.status,'disabled');
 assert.equal(off.source,'managed');
 assert.equal(off.revision,1);
 assert.equal(developerViewerEligible(decoded,member,{status:'approved'},env,now.valueOf(),disabled),false);
 const enabled={...disabled,enabled:true,revision:2};
 assert.equal(developerViewerGrantState(id,enabled,env,now).enabled,true);
 assert.equal(developerViewerEligible(decoded,member,{status:'approved'},env,now.valueOf(),enabled),true);
 assert.equal(developerViewerNewExpiry(id,disabled,env,now),'2027-01-31');
});
test('manual grant requires non-expired expiry and exact Discord binding, including no ENV fallback',()=>{
 const empty={DISCORD_GUILD_ID:guild};
 const enabled={discordId:id,enabled:true,expiresOn:'2026-12-31',revision:5};
 assert.equal(developerViewerGrantState(id,enabled,empty,now).enabled,true);
 assert.equal(developerViewerGrantState(id,{...enabled,expiresOn:'2026-11-23'},env,now).enabled,false);
 assert.equal(developerViewerGrantState(id,{...enabled,discordId:'123456789012345677'},env,now).enabled,false);
 assert.equal(developerViewerGrantState(id,{...enabled,expiresOn:'2027-02-31'},env,now).enabled,false);
 assert.equal(developerViewerGrantState(id,{...enabled,enabled:'true'},env,now).enabled,false);
 assert.equal(developerViewerGrantState(id,{...enabled,revision:5},empty,now).revision,5);
 assert.equal(developerViewerNewExpiry(id,null,empty,now),'2026-12-24');
});
test('form accepts only bool, audited reason and optimistic revision',()=>{
 const good={enabled:false,expectedRevision:0,reason:'Toegang tijdelijk intrekken wegens afronding'};
 assert.deepEqual(validateDeveloperViewerChange(good),good);
 for(const extra of [
  {enabled:'false'},{expectedRevision:-1},{reason:'te kort'},
  {role:'beheerder'},{departments:['politie']},{expiresOn:'2099-01-01'}
 ])assert.throws(()=>validateDeveloperViewerChange({...good,...extra}));
 assert.throws(()=>validateDeveloperViewerChange({...good,reason:'<> injectie'}));
});
test('only genuine Technisch Beheer may change the toggle; Developer is permanently blocked',()=>{
 const technical={uid:'discord:'+id,discordId:id,role:'beheerder',
  portalTechnicalMode:true,profileTechnicalAvailable:true};
 assert.equal(mayEditTechnicalSettings(technical),true);
 assert.equal(mayEditTechnicalSettings({...technical,portalDeveloperReadOnly:true}),false);
 assert.equal(readOnlyDeveloperRequestAllowed('PUT','/api/users/'+id+'/developer-view'),false);
 assert.equal(readOnlyDeveloperRequestAllowed('POST','/api/users/'+id+'/developer-view'),false);
});
test('user management offers safe switch beside service roles; backend logs and does not edit role grants',()=>{
 const html=read('public/gebruikersbeheer.html');
 const routes=read('src/user-routes.js');
 const server=read('src/server.js');
 assert.match(html,/Developer AAN zetten/);
 assert.match(html,/Developer UIT zetten/);
 assert.match(html,/canManageDeveloperViewer&&u\.status==='approved'/);
 assert.match(html,/expectedRevision:view\.revision\|\|0/);
 assert.match(html,/if\(!developerReadOnly&&moreBody\.childElementCount\)/);
 assert.match(routes,/app\.put\('\/api\/users\/:discordId\/developer-view',requireUser/);
 assert.match(routes,/if\(!mayEditTechnicalSettings\(req\.bpd\)\)/);
 assert.match(routes,/!approvedManagedEntry\(account\.data\(\),id\)/);
 assert.match(routes,/tx\.create\(audit,/);
 assert.match(routes,/DEVELOPER_VIEWER_COLLECTION/);
 assert.match(server,/developerViewerEligible\(verified,member,managed\.data\(\)/);
 assert.match(server,/developerGrant/);
});
