import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierGrantScope,dossierGrantIsAdmin,dossierGrantPayload,activeDossierGrant,
  applyDossierGrants,verifyBoardDiscordRole} from '../src/dossier-grants.js';
import {mayWriteManagement} from '../src/management-utils.js';
const id='123456789012345678',id2='987654321098765432',guild='1309532438053130326';
const admin={uid:'discord:'+id,discordId:id,role:'beheerder',
  departments:['politie'],departmentRoles:{politie:'korpsleiding'}};
const leader={uid:'discord:'+id,discordId:id,role:'korpsleiding',
  departments:['politie'],departmentRoles:{politie:'korpsleiding'}};
const entry={status:'approved',permissions:[]};
test('Bestuur and technical administrators can manage all departments, police corps leadership only police',()=>{
 for(const dept of ['politie','ambulance','brandweer','depannage']){
   assert.equal(dossierGrantScope(admin,false,null,dept),true);
   assert.equal(dossierGrantScope(leader,false,entry,dept),true);
   assert.equal(dossierGrantScope(leader,true,null,dept),true);
 }
 assert.equal(dossierGrantScope(leader,false,null,'politie'),true);
 assert.equal(dossierGrantScope(leader,false,null,'ambulance'),false);
 assert.equal(dossierGrantScope(leader,false,null,'brandweer'),false);
 assert.equal(dossierGrantScope({...leader,departmentRoles:{politie:'basiskader'}},false,null,'politie'),false);
 assert.equal(dossierGrantIsAdmin({role:'basiskader',departments:['politie']},false,null),false);
});
test('Validated grants cannot contain elevated rank, arbitrary scopes, or short justification',()=>{
 const valid={discordId:id2,dept:'brandweer',level:'read',reason:'Dossierrecht na controle'};
 assert.deepEqual(dossierGrantPayload(valid),valid);
 for(const change of [{level:'beheerder'},{dept:'bestuur'},{reason:'kort'},{discordId:'x'},
  {role:'korpsleiding'},{level:'all-read'}])
   assert.throws(()=>dossierGrantPayload({...valid,...change}));
});
test('Revoked entries never permit reading; delegated writers can add only routine notes',()=>{
 const old=process.env.FIREBASE_PROJECT_ID;
 try{
   process.env.FIREBASE_PROJECT_ID='belgiepd-test';
   const med={...leader,departments:['ambulance'],departmentRoles:{ambulance:'basiskader'}};
   const original={discordId:id,dept:'ambulance',level:'manage',status:'active'};
   const read=applyDossierGrants(med,[],[original]);
   assert.deepEqual(read.departments,['ambulance']);
   assert.deepEqual(read.manageDepartments,['ambulance']);
   const actor={...med,dossierAllowedDepartments:read.departments,dossierManageDepartments:read.manageDepartments};
   assert.equal(mayWriteManagement(actor,'ambulance','notitie'),true);
   for(const type of ['personeelsbeweging','specialisatiebeperking','opleiding','naamswijziging'])
     assert.equal(mayWriteManagement(actor,'ambulance',type),false);
   const revoke=applyDossierGrants(med,[],[{...original,status:'revoked'}]);
   assert.deepEqual(revoke.departments,[]);
   const switchedDept=applyDossierGrants({...med,departments:['politie']},[],[original]);
   assert.deepEqual(switchedDept.manageDepartments,[]);
   assert.equal(activeDossierGrant({...original,status:'revoked'},'ambulance',id),false);
   assert.equal(activeDossierGrant(original,'ambulance',id),true);
 }finally{if(old===undefined)delete process.env.FIREBASE_PROJECT_ID;else process.env.FIREBASE_PROJECT_ID=old;}
});
test('TESTER is read-only and never activates in MAIN',()=>{
 const old=process.env.FIREBASE_PROJECT_ID;
 const tester={discordId:id,level:'all-read',status:'active'};
 try{
   process.env.FIREBASE_PROJECT_ID='belgiepd-test';
   const allowed=applyDossierGrants(leader,['politie'],[],tester);
   assert.equal(allowed.tester,true);
   assert.deepEqual(allowed.departments,['politie','ambulance','brandweer','depannage']);
   assert.deepEqual(allowed.manageDepartments,[]);
   process.env.FIREBASE_PROJECT_ID='belgiepd-main';
   assert.deepEqual(applyDossierGrants(leader,['politie'],[],tester).departments,['politie']);
 }finally{if(old===undefined)delete process.env.FIREBASE_PROJECT_ID;else process.env.FIREBASE_PROJECT_ID=old;}
});
test('Bestuur Discord authorization needs a recently verified role from correct guild',()=>{
 const current=Date.now();
 const member={guildId:guild,roleIds:['1309532438082355251'],verifiedAt:current-5000};
 assert.equal(verifyBoardDiscordRole(member,guild,current),true);
 assert.equal(verifyBoardDiscordRole({...member,verifiedAt:current-1000000},guild,current),false);
 assert.equal(verifyBoardDiscordRole({...member,guildId:'999999999999999999'},guild,current),false);
 assert.equal(verifyBoardDiscordRole({...member,roleIds:['1309532438053130326']},guild,current),false);
});
test('Routes preserve existing personnel ranks and include audited grant/revoke controls',()=>{
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const server=read('src/server.js'),routes=read('src/dossier-grant-routes.js'),ui=read('public/gebruikersbeheer.html');
 assert.ok(server.includes("app.use('/api/dossier-grants',express.json"));
 assert.ok(server.includes('installDossierGrantRoutes(app,{requireUser,accessList})'));
 assert.ok(server.includes('applyDossierGrants(req.bpd,original'));
 assert.ok(routes.includes('approvedManagedEntry'));
 assert.ok(routes.includes("store.collection(DOSSIER_GRANT_AUDIT).doc()"));
 assert.ok(routes.includes("app.post('/api/dossier-grants/:dept/:discordId/revoke'"));
 assert.ok(routes.includes("process.env.FIREBASE_PROJECT_ID!=='belgiepd-test'"));
 assert.ok(routes.includes("if(discordId===req.bpd.discordId)return res.status(403)"));
 assert.ok(ui.includes('id="dossierGrantSection"'));
 assert.ok(ui.includes('id="dossierTesterOn"'));
 assert.ok(ui.includes('data-tab="services"'));
});
