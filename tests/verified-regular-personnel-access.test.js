import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedRegularCandidate,stillEligibleAutoRegular,
 ensureVerifiedRegularAccess,AUTO_REGULAR_SOURCE} from '../src/verified-regular-personnel-access.js';

const guild='123456789123456789',id='432432432432432432',now=Date.now();
const token={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,
 firebase:{sign_in_provider:'custom'}};
const member=(roleIds,at=now-1000)=>({
 guildId:guild,username:'Voorbeeld',verifiedAt:at,roleIds
});
const polis=['1309532438053130326'],bw=['1309532438053130324'],
 amb=['1309532438053130323'],lsra=['1309532438019706971'];
const roster=(dept,call='333',rank='Inspecteur',status='ACTIEF')=>({
 dept,personId:id,call,rank,status,name:'Voorbeeld'});
const candidate=(roles,people,env={})=>
 verifiedRegularCandidate(token,member(roles),guild,people,env,now);
function fakeDb(initial=null){
 let record=initial;
 const audit=[];
 const ref={collection:()=>({doc:()=>({kind:'audit'})})};
 return {audit,get record(){return record},store:{
  collection:name=>{assert.equal(name,'bpd_portal_users');return {doc:key=>{assert.equal(key,id);return ref}};},
  runTransaction:async work=>work({
    get:async()=>({exists:record!=null,data:()=>record}),
    set:(_ref,next,opts)=>{assert.equal(opts.merge,true);record={...record,...next}},
    create:(_ref,next)=>audit.push(next)
  })
 }};
}
test('Eigen Discord plus unieke personeelsfiche keurt gewone diensten goed',()=>{
 const found=candidate([...polis,...bw,...amb,...lsra],[
  roster('politie','432'),roster('brandweer','012','Brandweerman'),
  roster('ambulance','022','Ambulancier'),roster('depannage','032','LSRA')]);
 assert.deepEqual(found.departments,['politie','brandweer','ambulance','depannage']);
 assert.deepEqual(found.departmentRoles,{politie:'basiskader',brandweer:'basiskader',
  ambulance:'basiskader',depannage:'basiskader'});
 assert.equal(found.serviceFunctions.depannage,'lsra');
 assert.equal(found.serviceFunctions.brandweer,'brandweer');
});
test('Politie 2xx is Agentenkader, geen Middenkader; tijdelijke 1xx niet automatisch',()=>{
 assert.equal(candidate(polis,[roster('politie','245','Agent')])?.serviceFunctions.politie,'agentenkader');
 assert.equal(candidate(polis,[roster('politie','145','Agent')]),null);
 assert.equal(candidate(polis,[roster('politie','745','Hoofdinspecteur')]),null);
 assert.equal(candidate([...polis,'1351212180120408166'],[roster('politie','245','Agent')]),null);
});
test('Hoger kader, Bestuur, AWV en technisch beheer vereisen handmatige beslissing',()=>{
 const high=['1335578488664490057','1473474238664020151','1562710901080068229',
 '1554906632897560787','1395115819020714105','1309532438053130325',
 '1309532438019706969','1309532438082355251'];
 for(const h of high)assert.equal(candidate([...polis,h],[roster('politie','432')]),null,h);
 assert.equal(candidate(bw,[roster('brandweer','30','Sergeant')]),null);
 assert.equal(candidate(amb,[roster('ambulance','30','DIR-MED')]),null);
 assert.equal(candidate(polis,[roster('politie','432')],{
  BPD_TECHNICAL_ADMIN_DISCORD_IDS:id}),null);
});
test('Geen goedkeuring bij verlopen login, andere guild/ID, ontslag of dubbel dossier',()=>{
 assert.equal(verifiedRegularCandidate(token,member(polis,now-20*60000),guild,
  [roster('politie','432')],{},now),null);
 assert.equal(verifiedRegularCandidate({...token,bpdGuildId:'999999999999999999'},
  member(polis),guild,[roster('politie','432')],{},now),null);
 assert.equal(candidate(polis,[roster('politie','432','Inspecteur','ONTSLAG')]),null);
 assert.equal(candidate(polis,[roster('politie','432'),roster('politie','435')]),null);
 assert.equal(candidate(polis,[roster('politie','432','Inspecteur','INACTIEF')]),null);
 assert.equal(candidate(polis,[]),null);
});
test('Audit, eenmaal goedkeuren, blokkering en bestaande rechten blijven behouden',async()=>{
 const roles=member(polis);
 const db=fakeDb();
 const result=await ensureVerifiedRegularAccess(db.store,token,roles,guild,[roster('politie','432')],{},now);
 assert.equal(result.changed,true);
 assert.equal(db.record.status,'approved');
 assert.equal(db.record.approvalSource,AUTO_REGULAR_SOURCE);
 assert.equal(db.audit[0].action,'auto_approve_verified_regular_personnel');
 const again=await ensureVerifiedRegularAccess(db.store,token,roles,guild,[roster('politie','432')],{},now);
 assert.equal(again.changed,false);
 assert.equal(db.audit.length,1);
 for(const status of ['blocked','approved']){
  const old={discordId:id,status,role:'officierenkader',
   departments:['politie'],departmentRoles:{politie:'officierenkader'}};
  const store=fakeDb(old);
  const attempted=await ensureVerifiedRegularAccess(store.store,token,roles,guild,[roster('politie','432')],{},now);
  assert.equal(attempted.changed,false);
  assert.deepEqual(store.record,old);
 }
});
test('Automatische toegang vervalt wanneer de Discord-verificatie of gewone rollen vervallen',()=>{
 const rec={discordId:id,status:'approved',role:'basiskader',departments:['politie'],
  departmentRoles:{politie:'basiskader'},approvalSource:AUTO_REGULAR_SOURCE};
 assert.equal(stillEligibleAutoRegular(token,member(polis),guild,rec,{},now),true);
 assert.equal(stillEligibleAutoRegular(token,member(bw),guild,rec,{},now),false);
 assert.equal(stillEligibleAutoRegular(token,member([...polis,'1335578488664490057']),guild,rec,{},now),false);
 assert.equal(stillEligibleAutoRegular(token,member(polis,now-25*3600000),guild,rec,{},now),false);
 assert.equal(stillEligibleAutoRegular(token,member(polis),guild,{...rec,approvalSource:null},{},now),true);
});
test('Alleen serverroutes keuren goed; handmatige overrides worden niet aangeraakt',()=>{
 const f=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const server=f('src/server.js'),routes=f('src/user-routes.js'),docker=f('Dockerfile');
 assert.match(server,/ensureVerifiedRegularAccess\(store,verified,member/);
 assert.match(server,/stillEligibleAutoRegular\(verified,member/);
 assert.match(routes,/ensureVerifiedRegularAccess\(db\(\),decoded,member/);
 assert.match(routes,/stillEligibleAutoRegular\(decoded,member/);
 assert.match(docker,/verified-regular-personnel-access\.test\.js/);
});
