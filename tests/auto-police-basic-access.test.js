import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedPoliceBasicRole,verifiedPoliceBasicCandidate,
 autoPoliceBasicActive,hideUnverifiedAutoPoliceBasic,
 ensureVerifiedPoliceBasicAccess,POLICE_MEMBER_ROLE,POLICE_BASIC_ROLE,
 AUTO_BASIC_SOURCE} from '../src/verified-police-basic-access.js';

const guild='123456789123456789',id='432432432432432432',now=Date.now();
const decoded={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,
 firebase:{sign_in_provider:'custom'}};
const member=(roles=[POLICE_MEMBER_ROLE,POLICE_BASIC_ROLE],at=now-1000)=>({
 guildId:guild,verifiedAt:at,username:'Arixx',roleIds:roles
});
const police=(call='432',rank='Inspecteur van Politie',personId=id)=>({
 dept:'politie',personId,call,rank,name:'Arixx',status:'ACTIEF'
});
function fakeFirestore(existing=null){
 const docs=new Map(existing?[ [id,structuredClone(existing)] ]:[]);
 const audit=[];
 const store={collection:name=>({
   doc:key=>{
     assert.equal(name,'bpd_portal_users');
     assert.equal(key,id);
     const ref={id:key,collection:child=>({
       doc:()=>({auditChild:child})
     })};
     return ref;
   }
 }),runTransaction:async fn=>{
   const tx={
     get:async ref=>({exists:docs.has(ref.id),
       data:()=>docs.get(ref.id)}),
     set:(ref,value,opts)=>{
       assert.equal(opts.merge,true);
       docs.set(ref.id,{...(docs.get(ref.id)||{}),...value});
     },
     create:(ref,value)=>{
       assert.equal(ref.auditChild,'audit');
       audit.push(value);
     }
   };
   return fn(tx);
 }};
 return {store,docs,audit};
}
test('Discord-rol-ID Politie en één officiële 432-fiche volstaan automatisch',()=>{
 const proof=verifiedPoliceBasicRole(decoded,member(),guild,now);
 assert.equal(proof.discordId,id);
 assert.equal(proof.baseRoleSeen,true);
 const candidate=verifiedPoliceBasicCandidate(decoded,member(),guild,[police()],now);
 assert.equal(candidate.call,'432');
 assert.equal(candidate.discordId,id);
 // De algemene Politierol + unieke politiefiche mogen ook volstaan als
 // de extra generieke Basiskaderrol op Discord ontbreekt.
 const fallback=verifiedPoliceBasicCandidate(decoded,member([POLICE_MEMBER_ROLE]),guild,[police()],now);
 assert.equal(fallback?.baseRoleSeen,false);
});
test('Niet enkel roepnummer of Brandweerrol: verificatie en Politierol blijven verplicht',()=>{
 assert.equal(verifiedPoliceBasicCandidate(decoded,member(['1395115819020714105']),guild,[police()],now),null);
 assert.equal(verifiedPoliceBasicCandidate(decoded,member(),guild,[police(),police()],now),null);
 assert.equal(verifiedPoliceBasicCandidate(decoded,member(),guild,[police('720','Hoofdinspecteur van Politie')],now),null);
 assert.equal(verifiedPoliceBasicCandidate(decoded,member(),guild,[police('432','Inspecteur', '555555555555555555')],now),null);
 assert.equal(verifiedPoliceBasicCandidate(decoded,member(),guild,[{...police(),lifecycleState:'archived'}],now),null);
 assert.equal(verifiedPoliceBasicCandidate(decoded,member([
  POLICE_MEMBER_ROLE,'1335578488664490057'
 ]),guild,[police()],now),null);
 assert.equal(verifiedPoliceBasicCandidate(decoded,member(),guild,[police()],now+16*60000),null);
 assert.equal(verifiedPoliceBasicCandidate({...decoded,bpdGuildId:'999999999999999999'},member(),guild,[police()],now),null);
});
test('Nieuwe, correct ingedeelde 432 kan automatisch beperkte Politie-Basiskaderfunctie krijgen',async()=>{
 const {store,docs,audit}=fakeFirestore();
 const result=await ensureVerifiedPoliceBasicAccess(store,decoded,member(),guild,[police()],now);
 assert.equal(result.changed,true);
 const saved=docs.get(id);
 assert.equal(saved.status,'approved');
 assert.deepEqual(saved.departments,['politie']);
 assert.deepEqual(saved.departmentRoles,{politie:'basiskader'});
 assert.equal(saved.role,'basiskader');
 assert.equal(saved.approvalSource,AUTO_BASIC_SOURCE);
 assert.equal(saved.autoPoliceBasic.source,AUTO_BASIC_SOURCE);
 assert.equal(audit[0].action,'auto_approve_verified_police_basic');
 assert.deepEqual(audit[0].roleIds,[POLICE_MEMBER_ROLE,POLICE_BASIC_ROLE]);
 const repeat=await ensureVerifiedPoliceBasicAccess(store,decoded,member(),guild,[police()],now);
 assert.equal(repeat.changed,false);
 assert.equal(audit.length,1);
});
test('Bestaande Brandweerleiding behoudt al haar rechten wanneer politie Basiskader bijkomt',async()=>{
 const previous={discordId:id,status:'approved',role:'korpsleiding',
  departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'},
  serviceFunctions:{brandweer:'zone'},username:'Arixx'};
 const {store,docs,audit}=fakeFirestore(previous);
 const result=await ensureVerifiedPoliceBasicAccess(store,decoded,member([POLICE_MEMBER_ROLE]),guild,[police()],now);
 assert.equal(result.changed,true);
 const saved=docs.get(id);
 assert.deepEqual(saved.departments,['brandweer','politie']);
 assert.deepEqual(saved.departmentRoles,{brandweer:'korpsleiding',politie:'basiskader'});
 assert.equal(saved.role,'korpsleiding');
 assert.deepEqual(saved.serviceFunctions,{brandweer:'zone'});
 assert.equal(saved.approvalSource,undefined);
 assert.equal(audit[0].preservedOtherDepartments,true);
 assert.deepEqual(audit[0].roleIds,[POLICE_MEMBER_ROLE]);
});
test('Bestaande goedgekeurde Politiefunctie of geblokkeerde accounts worden nooit overschreven',async()=>{
 for(const record of [
  {discordId:id,status:'blocked',role:'korpsleiding',
   departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'}},
  {discordId:id,status:'approved',role:'officierenkader',
   departments:['politie','brandweer'],
   departmentRoles:{politie:'officierenkader',brandweer:'officierenkader'}},
  {discordId:id,status:'approved',role:'korpsleiding',
   departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'},
   autoPoliceBasicBlocked:true}
 ]){
  const {store,docs,audit}=fakeFirestore(record);
  const result=await ensureVerifiedPoliceBasicAccess(store,decoded,member(),guild,[police()],now);
  assert.equal(result.changed,false);
  assert.deepEqual(docs.get(id),record);
  assert.equal(audit.length,0);
 }
});
test('Verwijderde of verlopen automatische Politierol levert geen nieuwe toegang op',()=>{
 const record={status:'approved',departmentRoles:{politie:'basiskader'},
   autoPoliceBasic:{source:AUTO_BASIC_SOURCE}};
 assert.equal(autoPoliceBasicActive(decoded,member(),guild,record,now),true);
 assert.equal(autoPoliceBasicActive(decoded,member([POLICE_BASIC_ROLE]),guild,record,now),false);
 assert.equal(autoPoliceBasicActive(decoded,member(),guild,record,now+25*60*60*1000),false);
 const derived=hideUnverifiedAutoPoliceBasic({
  role:'korpsleiding',departments:['brandweer','politie'],
  departmentRoles:{brandweer:'korpsleiding',politie:'basiskader'}
 });
 assert.deepEqual(derived.departments,['brandweer']);
 assert.deepEqual(derived.departmentRoles,{brandweer:'korpsleiding'});
 assert.equal(derived.role,'korpsleiding');
 assert.equal(hideUnverifiedAutoPoliceBasic({role:'basiskader',
  departments:['politie'],departmentRoles:{politie:'basiskader'}}),null);
});
test('Handmatige functiewijzigingen en intrekkingen mogen nooit automatisch worden ongedaan gemaakt',()=>{
 const routes=readFileSync(new URL('../src/user-routes.js',import.meta.url),'utf8');
 assert.match(routes,/autoPoliceBasicBlocked:true/);
 assert.match(routes,/autoPoliceBasicBlocked:FieldValue\.delete\(\)/);
 const auth=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(auth,/ensureVerifiedPoliceBasicAccess\(store,verified,member/);
 assert.match(auth,/autoPoliceBasicActive\(verified,member/);
 assert.match(auth,/hideUnverifiedAutoPoliceBasic\(entry\)/);
 assert.match(auth,/if\(!snap\.stale\)/);
});
