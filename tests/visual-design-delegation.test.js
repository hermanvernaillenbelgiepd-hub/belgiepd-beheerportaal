import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isActiveVisualDesignGrant,validateVisualDesignGrantWrite,
 mayDelegateVisualDesign} from '../src/visual-design-grants.js';
const id='123456789012345678',other='123456789012345679';
const actor={uid:'discord:'+id,discordId:id,role:'basiskader'};
const technical={...actor,role:'beheerder',portalTechnicalMode:true,profileTechnicalAvailable:true};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('design-only grants are scoped to a signed Discord identity, expire and revoke immediately',()=>{
 assert.equal(isActiveVisualDesignGrant(actor,{discordId:id,enabled:true}),true);
 assert.equal(isActiveVisualDesignGrant(actor,{discordId:id,enabled:true,expiresOn:'2026-11-20'},'2026-11-20'),true);
 assert.equal(isActiveVisualDesignGrant(actor,{discordId:id,enabled:true,expiresOn:'2026-11-20'},'2026-11-21'),false);
 assert.equal(isActiveVisualDesignGrant(actor,{discordId:id,enabled:false}),false);
 assert.equal(isActiveVisualDesignGrant(actor,{discordId:other,enabled:true}),false);
 assert.equal(isActiveVisualDesignGrant({...actor,uid:'google-id'},{discordId:id,enabled:true}),false);
 assert.equal(mayDelegateVisualDesign(actor),false);
 assert.equal(mayDelegateVisualDesign(technical),true);
});
test('grant and revoke require a reason and optimistic revision, with validated dates',()=>{
 const data={action:'grant',reason:'Tijdelijk uitsluitend lay-out beheren',expiresOn:'2026-12-31',expectedRevision:0};
 assert.deepEqual(validateVisualDesignGrantWrite(id,data,new Date('2026-11-20T12:00:00Z')),{discordId:id,...data});
 for(const patch of [{action:'anything'},{reason:'kort'},{expectedRevision:-1},{expiresOn:'2020-01-01'},{expiresOn:'2026-02-30'},{isAdmin:true}])
  assert.throws(()=>validateVisualDesignGrantWrite(id,{...data,...patch},new Date('2026-11-20T12:00:00Z')));
 assert.throws(()=>validateVisualDesignGrantWrite(id,{...data,action:'revoke'},new Date('2026-11-20T12:00:00Z')));
 assert.deepEqual(validateVisualDesignGrantWrite(id,{action:'revoke',reason:'Machtiging expliciet intrekken',expectedRevision:2}),{
  discordId:id,action:'revoke',reason:'Machtiging expliciet intrekken',expiresOn:null,expectedRevision:2});
});
test('the verified dedicated grant protects edits without granting technical or personnel rights',()=>{
 const routes=read('src/visual-design-routes.js'),server=read('src/server.js');
 assert.match(routes,/if\(!await canEditVisualDesign\(dbFactory\(\),req.bpd\)\)/);
 assert.match(routes,/mayDelegateVisualDesign\(req.bpd\)/);
 assert.match(routes,/approvedManagedEntry\(account.data\(\),input.discordId\)/);
 assert.match(routes,/db.runTransaction\(async tx=>/);
 assert.match(routes,/tx.create\(audit,/);
 assert.match(routes,/app.put\('\/api\/visual-design\/grants\/:discordId',requireUser/);
 assert.match(server,/installVisualDesignRoutes\(app,\{requireUser\}\)/);
});
