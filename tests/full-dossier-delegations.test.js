import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierGrantScope,dossierGrantPayload,applyDossierGrants,activeDossierGrant} from '../src/dossier-grants.js';
import {maySubmit,mayAmend} from '../src/registrations.js';
import {mayWriteManagement,mayReadManagement} from '../src/management-utils.js';
import {canLogTraining,canReviewTraining} from '../src/permissions-utils.js';
const id='111111111111111111',other='222222222222222222';
const services=['politie','ambulance','brandweer','depannage'];
const chief=(dept)=>({uid:'discord:'+id,discordId:id,role:'korpsleiding',
  departments:[dept],departmentRoles:{[dept]:'korpsleiding'}});
const staff=(dept)=>({uid:'discord:'+id,discordId:id,role:'basiskader',
  departments:[dept],departmentRoles:{[dept]:'basiskader'},
  dossierNativeDepartments:[]});
const grant=(dept,level)=>({discordId:id,dept,level,status:'active'});
test('Board/technical manage each service, corps leadership only own service',()=>{
 const board={status:'approved',permissions:[]},tech={...chief('politie'),role:'beheerder'};
 for(const dept of services){
   assert.equal(dossierGrantScope(tech,false,null,dept),true);
   assert.equal(dossierGrantScope(chief('politie'),false,board,dept),true);
   assert.equal(dossierGrantScope(chief('politie'),true,null,dept),true);
   assert.equal(dossierGrantScope(chief(dept),false,null,dept),true);
   for(const otherDept of services.filter(x=>x!==dept))
     assert.equal(dossierGrantScope(chief(dept),false,null,otherDept),false);
 }
 const zone={...staff('brandweer'),fireZoneChief:true};
 assert.equal(dossierGrantScope(zone,false,null,'brandweer'),true);
 assert.equal(dossierGrantScope(zone,false,null,'politie'),false);
 assert.equal(dossierGrantScope({...zone,fireZoneChief:false},false,null,'brandweer'),false);
});
test('Three levels are validated; each full grant is department- and identity-bound',()=>{
 for(const level of ['read','manage','full']){
   assert.deepEqual(dossierGrantPayload({discordId:other,dept:'ambulance',level,reason:'Geverifieerde diensttoegang'}),
    {discordId:other,dept:'ambulance',level,reason:'Geverifieerde diensttoegang'});
 }
 assert.throws(()=>dossierGrantPayload({discordId:other,dept:'politie',level:'beheerder',reason:'Geen rolmachtiging'}));
 assert.equal(activeDossierGrant(grant('brandweer','full'),'brandweer',id),true);
 assert.equal(activeDossierGrant(grant('brandweer','full'),'politie',id),false);
 assert.equal(activeDossierGrant(grant('brandweer','full'),'brandweer',other),false);
 const a=staff('brandweer');
 const full=applyDossierGrants(a,[],[grant('brandweer','full')]);
 assert.deepEqual(full.departments,['brandweer']);
 assert.deepEqual(full.manageDepartments,['brandweer']);
 assert.deepEqual(full.fullDepartments,['brandweer']);
 assert.deepEqual(applyDossierGrants(a,[],[{...grant('brandweer','full'),status:'revoked'}]).fullDepartments,[]);
 assert.deepEqual(applyDossierGrants(staff('politie'),[],[grant('brandweer','full')]).fullDepartments,[]);
});
test('Read, limited, and full yield progressively scoped case rights',()=>{
 for(const dept of services){
   const base=staff(dept);
   const read=applyDossierGrants(base,[],[grant(dept,'read')]);
   const limited=applyDossierGrants(base,[],[grant(dept,'manage')]);
   const complete=applyDossierGrants(base,[],[grant(dept,'full')]);
   const actor=(x)=>({...base,dossierAllowedDepartments:x.departments,
     dossierManageDepartments:x.manageDepartments,dossierFullDepartments:x.fullDepartments});
   assert.equal(mayWriteManagement(actor(read),dept,'notitie'),false);
   assert.equal(mayWriteManagement(actor(limited),dept,'notitie'),true);
   assert.equal(mayWriteManagement(actor(limited),dept,'opleiding'),false);
   assert.equal(maySubmit(actor(limited),'sanctie',dept),false);
   assert.equal(mayWriteManagement(actor(complete),dept,'notitie'),true);
   assert.equal(mayWriteManagement(actor(complete),dept,'opleiding'),true);
   assert.equal(mayReadManagement(actor(complete),dept),true);
   assert.equal(maySubmit(actor(complete),'observatie',dept),true);
   assert.equal(maySubmit(actor(complete),'sanctie',dept),true);
   assert.equal(mayAmend(actor(complete),'sanctie',dept),true);
   for(const forbidden of ['naamswijziging','personeelsbeweging','specialisatiebeperking','promotievoorstel'])
     assert.equal(mayWriteManagement(actor(complete),dept,forbidden),false);
   assert.equal(canLogTraining({...base,dossierFullDepartments:complete.fullDepartments},dept,{}),true);
   assert.equal(canReviewTraining({...base,dossierFullDepartments:complete.fullDepartments},dept,{}),true);
   for(const elsewhere of services.filter(d=>d!==dept)){
     assert.equal(mayWriteManagement(actor(complete),elsewhere,'opleiding'),false);
     assert.equal(mayAmend(actor(complete),'sanctie',elsewhere),false);
     assert.equal(canLogTraining({...base,dossierFullDepartments:complete.fullDepartments},elsewhere,{}),false);
   }
 }
});
test('Server requires verified dossier context, per-department writes and audited grants',()=>{
 const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const app=file('src/server.js'),grantRoute=file('src/dossier-grant-routes.js'),
   registrations=file('src/registration-routes.js'),training=file('src/role-routes.js');
 const ui=file('public/gebruikersbeheer.html'),trainingPolicy=file('src/permissions-utils.js');
 assert.ok(app.includes('req.bpd.dossierFullDepartments=scope.fullDepartments'));
 assert.ok(app.includes('installDossierGrantRoutes(app,{requireUser:requireDossierUser,accessList})'));
 assert.ok(grantRoute.includes("store.collection(DOSSIER_GRANT_AUDIT).doc()"));
 assert.ok(grantRoute.includes("if(discordId===req.bpd.discordId)return res.status(403)"));
 assert.ok(grantRoute.includes("['manage','full'].includes(level)&&!approved.departments.includes(dept)"));
 assert.ok(registrations.includes('req.bpd.dossierFullDepartments?.includes(dept)'));
 assert.ok(registrations.includes("['politie','brandweer','ambulance','depannage']"));
 assert.ok(training.includes('verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID)===discordId'));
 assert.ok(training.includes('approvedManagedEntry(portal.data(),discordId)'));
 assert.ok(trainingPolicy.includes('dossierFullDepartments?.includes(dept)'));
 assert.ok(ui.includes('option value="full"'));
});
