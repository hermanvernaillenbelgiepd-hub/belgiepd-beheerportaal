import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {developerViewerEligible,readOnlyDeveloperActor,readOnlyDeveloperRequestAllowed}
 from '../src/developer-readonly-profile.js';
import {mayEditTechnicalSettings,mayOpenTechnicalCenter}
 from '../src/technical-center-config.js';
import {canManageVisualDesign} from '../src/visual-design-policy.js';
import {mayDelegateVisualDesign} from '../src/visual-design-grants.js';
import {canViewPersonnel,canReadPersonnelSubject}
 from '../src/personnel-editor-policy.js';
const id='298799630458552323',guild='123456789012345678',now=Date.parse('2026-11-24T13:00:00Z');
const decoded={uid:'discord:'+id,firebase:{sign_in_provider:'custom'},
 bpdDiscord:true,bpdGuildId:guild};
const member={guildId:guild,roleIds:[],verifiedAt:now-10*60000};
const env={BPD_DEVELOPER_VIEWER_IDS:id,BPD_DEVELOPER_VIEWER_UNTIL:'2027-01-31',DISCORD_GUILD_ID:guild};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('explicit ID+Discord OAuth+guild proof+unexpired grant are all mandatory',()=>{
 assert.equal(developerViewerEligible(decoded,member,null,env,now),true);
 assert.equal(developerViewerEligible(decoded,member,{status:'pending'},env,now),true);
 assert.equal(developerViewerEligible(decoded,member,{status:'blocked'},env,now),false);
 assert.equal(developerViewerEligible({...decoded,uid:'discord:298799630458552324'},member,null,env,now),false);
 assert.equal(developerViewerEligible({...decoded,bpdDiscord:false},member,null,env,now),false);
 assert.equal(developerViewerEligible(decoded,{...member,verifiedAt:now-9*3600000},null,env,now),false);
 assert.equal(developerViewerEligible(decoded,{...member,guildId:'999999999999999999'},null,env,now),false);
 assert.equal(developerViewerEligible(decoded,member,null,{...env,BPD_DEVELOPER_VIEWER_UNTIL:'2026-11-23'},now),false);
 assert.equal(developerViewerEligible(decoded,member,null,{...env,BPD_DEVELOPER_VIEWER_IDS:''},now),false);
});
test('only two appearance write endpoints; all data/rights/settings writes denied',()=>{
 for(const method of ['GET','HEAD'])assert.equal(readOnlyDeveloperRequestAllowed(method,'/api/management/cases'),true);
 for(const path of ['/api/visual-design/admin','/api/visual-design/pages/activiteitscentrum'])
  assert.equal(readOnlyDeveloperRequestAllowed('PUT',path),true,path);
 for(const path of ['/api/management/cases','/api/personnel/politie/'+id,
  '/api/users/'+id+'/approve','/api/technical-center/config','/api/visual-design/grants/'+id,
  '/api/visual-design/pages/../grants','/api/visual-design/pages/catalog'])
  assert.equal(readOnlyDeveloperRequestAllowed('PUT',path),false,path);
 for(const method of ['POST','PATCH','DELETE'])
  assert.equal(readOnlyDeveloperRequestAllowed(method,'/api/visual-design/admin'),false);
});
test('read-only view inherits dossier and staff read capability but no technical writes',()=>{
 const actor=readOnlyDeveloperActor('discord:'+id,id);
 assert.equal(actor.portalDeveloperReadOnly,true);
 assert.equal(canViewPersonnel(actor,'politie'),true);
 assert.equal(canViewPersonnel(actor,'brandweer'),true);
 assert.equal(mayOpenTechnicalCenter(actor),true);
 assert.equal(mayEditTechnicalSettings(actor),false);
 assert.equal(mayDelegateVisualDesign(actor),false);
 assert.equal(canManageVisualDesign(actor),true);
 assert.deepEqual(actor.departments,['politie','brandweer','ambulance','depannage','burger']);
});
test('server does not auto-approve developer and rejects writes before protected routes',()=>{
 const server=read('src/server.js');
 const user=read('src/user-routes.js');
 assert.match(server,/developerViewerEligible\(verified,member,managed\.data\(\)/);
 assert.match(server,/readOnlyDeveloperRequestAllowed\(req\.method,req\.path\)/);
 assert.match(server,/req\.bpd=readOnlyDeveloperActor\(verified\.uid,id\)/);
 assert.match(server,/if\(!managed\.exists\|\|managed\.get\('status'\)==='pending'\)/);
 assert.ok(server.indexOf('developerViewerEligible(verified,member')<
   server.indexOf("if(!managed.exists||managed.get('status')==='pending')"));
 assert.match(user,/developerReadOnly:req\.bpd\.portalDeveloperReadOnly===true/);
 assert.match(server,/developerReadOnly:req\.bpd\.portalDeveloperReadOnly===true/);
 assert.match(read('public/bpd-navigation.js'),/showDeveloperReadOnlyLabel/);
});
