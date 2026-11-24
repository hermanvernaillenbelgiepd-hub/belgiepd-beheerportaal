import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDesignOnlyApiPath,mayIssueDeveloperDesignGrant,developerDesignActor}
 from '../src/visual-design-developer-policy.js';
import {canManageVisualDesign} from '../src/visual-design-policy.js';
import {mayEditTechnicalSettings,mayOpenTechnicalCenter}
 from '../src/technical-center-config.js';
import {isUserManager} from '../src/user-access.js';
import {mayDelegateVisualDesign} from '../src/visual-design-grants.js';
const id='123456789012345678',guild='123456789012345679';
const uid='discord:'+id,now=Date.UTC(2026,10,24,11);
const member={guildId:guild,verifiedAt:now-120000,roleIds:[]};
const grant={discordId:id,profile:'developer',enabled:true,expiresOn:'2026-12-01'};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('an external verified Discord member can get Developer without operational role approval',()=>{
 assert.equal(mayIssueDeveloperDesignGrant(id,undefined,member,guild,now),true);
 assert.equal(mayIssueDeveloperDesignGrant(id,{status:'pending'},member,guild,now),true);
 assert.equal(mayIssueDeveloperDesignGrant(id,{status:'blocked'},member,guild,now),false);
 assert.equal(mayIssueDeveloperDesignGrant(id,undefined,{...member,guildId:'000000000000000000'},guild,now),false);
 assert.equal(mayIssueDeveloperDesignGrant(id,undefined,{...member,verifiedAt:now-9*86400000},guild,now),false);
 assert.equal(mayIssueDeveloperDesignGrant(id,undefined,{...member,roleIds:[12345]},guild,now),false);
 assert.equal(mayIssueDeveloperDesignGrant(id,undefined,undefined,guild,now),false);
});
test('only exact design API paths are allowed; no grants or protected staff access',()=>{
 for(const path of ['/api/visual-design/admin','/api/visual-design/pages/catalog',
  '/api/visual-design/pages/index','/api/visual-design/pages/index/history'])
  assert.equal(isDesignOnlyApiPath(path),true,path);
 for(const path of ['/api/visual-design/grants','/api/visual-design/grants/'+id,
  '/api/users/context','/api/technical-center/context','/api/management/cases',
  '/api/duty-times/dossiers/politie/'+id,'/api/visual-design/pages/../grants',
  '/api/visual-design/admin/anything','/api/visual-design/public'])
  assert.equal(isDesignOnlyApiPath(path),false,path);
});
test('isolated developer actor has no technical, cadre, staff or delegation privileges',()=>{
 const actor=developerDesignActor(uid,id,grant,'2026-11-24');
 assert.equal(actor.role,'developer');assert.deepEqual(actor.departments,[]);
 assert.equal(actor.portalDesignOnly,true);assert.equal(actor.portalTechnicalMode,false);
 assert.equal(isUserManager(actor),false);
 assert.equal(mayOpenTechnicalCenter(actor),false);
 assert.equal(mayEditTechnicalSettings(actor),false);
 assert.equal(canManageVisualDesign(actor),false);
 assert.equal(mayDelegateVisualDesign(actor),false);
 assert.equal(developerDesignActor('google-session',id,grant,'2026-11-24'),null);
 assert.equal(developerDesignActor(uid,id,{...grant,profile:'technisch'},'2026-11-24'),null);
 assert.equal(developerDesignActor(uid,id,{...grant,enabled:false},'2026-11-24'),null);
 assert.equal(developerDesignActor(uid,id,grant,'2027-01-01'),null);
});
test('portal guards isolated profile after verified Discord login with fresh grant',()=>{
 const server=read('src/server.js'),routes=read('src/visual-design-routes.js');
 const pageRoutes=read('src/visual-design-page-routes.js');
 assert.match(server,/verifiedDiscordIdentity\(verified,member,process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(server,/isDesignOnlyApiPath\(req\.path\)/);
 assert.match(server,/!approvedManagedEntry\(managed\.data\(\),id\)/);
 assert.match(server,/managed\.get\('status'\)!=='blocked'/);
 assert.match(server,/developerDesignActor\(verified\.uid,id,design\.data\(\)\)/);
 assert.match(server,/if\(developer\)\{req\.bpd=developer;return next\(\)\}/);
 assert.match(routes,/mayIssueDeveloperDesignGrant/);
 assert.match(routes,/collection\('bpd_discord_auth'\)/);
 assert.match(routes,/profile:'developer'/);
 assert.match(routes,/mayDelegateVisualDesign\(req\.bpd\)/);
 assert.match(pageRoutes,/profile:req\.bpd\.portalDesignOnly===true\?'developer':'operational'/);
});
test('Developer view makes restricted scope visible and time-limited grants revocable',()=>{
 const ui=read('public/visual-design-workspace.js');
 const form=read('public/visual-design-grants-editor.js');
 const html=read('public/vormgeving.html');
 assert.match(ui,/data\.profile==='developer'/);
 assert.match(ui,/\$\('designMgmtLink'\)\.hidden=onlyDesign/);
 assert.match(form,/Developer-profiel toekennen/);
 assert.match(form,/visualGrantExpires/);
 assert.match(form,/action:'revoke'/);
 assert.match(html,/id="designMgmtLink"/);
});
