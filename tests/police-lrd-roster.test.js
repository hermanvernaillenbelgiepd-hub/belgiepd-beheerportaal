import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LRD_DISCORD_ROLE_ID,LRD_SPECIALTY_LABEL,
  verifiedPoliceLrdRole,createPoliceLrdIndex,readVerifiedPoliceLrd} from '../src/police-lrd-policy.js';
import {publicPoliceRoster} from '../src/member-dashboard-routes.js';
import {SPECIALTY_LABELS} from '../src/normalize.js';
import {PUBLIC_POLICE_SPECIALTIES} from '../public/member-police-roster.js';

const first='111111111111111111',second='222222222222222222';
const guild='test-guild',clock=1800000000000;
const person=id=>({dept:'politie',personId:id,name:'Lid',rank:'Inspecteur',
  call:id===first?'438':'439',series:'Reeks 1',status:'Actief',
  specialties:[{label:'Radio BM',value:'Ja'}]});
const member=(id,verifiedAt=clock,roleIds=[LRD_DISCORD_ROLE_ID])=>({
  guildId:guild,verifiedAt,roleIds,username:id,secret:'NO_LEAK'
});

test('LRD role verification needs matching guild, fresh proof and exact role id',()=>{
 assert.equal(LRD_DISCORD_ROLE_ID,'1380843428354592780');
 assert.equal(verifiedPoliceLrdRole(member(first),guild,clock),true);
 assert.equal(verifiedPoliceLrdRole(member(first),guild,clock+15*60000),true);
 assert.equal(verifiedPoliceLrdRole(member(first),guild,clock+15*60000+1),false);
 assert.equal(verifiedPoliceLrdRole(member(first),'other-guild',clock),false);
 assert.equal(verifiedPoliceLrdRole(member(first,clock+1),guild,clock),false);
 assert.equal(verifiedPoliceLrdRole(member(first,clock,['123456789012345678']),guild,clock),false);
 assert.equal(verifiedPoliceLrdRole(null,guild,clock),false);
 assert.equal(verifiedPoliceLrdRole(member(first),'',clock),false);
});

test('Bounded LRD roster reader refreshes and caches verified membership only',async()=>{
 let now=clock,calls=0,roleIds=[LRD_DISCORD_ROLE_ID];
 const db={
  collection:collection=>({
    doc:id=>({collection,id})
  }),
  getAll:async(...refs)=>{
    calls++;
    return refs.map(ref=>({exists:true,data:()=>member(ref.id,clock,
      ref.id===first?roleIds:[])}));
  }
 };
 const read=createPoliceLrdIndex({firestore:()=>db,guildId:()=>guild,now:()=>now,
   botToken:()=>null});
 const rows=[person(first),person(second)];
 let ids=await read(rows);
 assert.deepEqual([...ids],[first]);
 ids.clear();
 assert.deepEqual([...(await read(rows))],[first]);
 assert.equal(calls,1);
 roleIds=[];
 now+=31*1000;
 assert.deepEqual([...(await read(rows))],[]);
 assert.equal(calls,2);
});

test('Public police roster includes verified LRD but never identity or permissions',()=>{
 const verified=new Set([first]);
 const records=publicPoliceRoster([person(first),person(second)],verified);
 assert.equal(records.length,2);
 assert.deepEqual(PUBLIC_POLICE_SPECIALTIES,SPECIALTY_LABELS.politie);
 assert.equal(records[0].specialties.find(s=>s.label===LRD_SPECIALTY_LABEL).value,'Ja');
 assert.equal(records[1].specialties.find(s=>s.label===LRD_SPECIALTY_LABEL).value,'Niet gecontroleerd');
 assert.equal(records[0].specialties.length,11);
 for(const row of records){
   assert.deepEqual(Object.keys(row).sort(),
     ['call','name','rank','series','status','specialties'].sort());
   assert.doesNotMatch(JSON.stringify(row),/111111111111111111|222222222222222222|NO_LEAK|roleIds/);
 }
 const manual=publicPoliceRoster([{...person(second),
   specialties:[{label:LRD_SPECIALTY_LABEL,value:'Ja'}]}]);
 assert.equal(manual[0].specialties.find(s=>s.label===LRD_SPECIALTY_LABEL).value,'Niet gecontroleerd',
   'Manuele waarden mogen Discord-rolverificatie niet vervangen');
});

test('Protected roster displays verified LRD as a presentation-only speciality',()=>{
 const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const server=source('src/server.js'),manager=source('src/personnel-editor-routes.js');
 assert.match(server,/readVerifiedPoliceLrd\(roster\)/);
 assert.match(manager,/lrdDiscordVerified:lrdVerified/);
 assert.match(manager,/lrdChecked/);
 const display=source('public/personnel-list-visuals.js');
 assert.match(display,/LRD \(Recherche\)/);
 assert.match(display,/\(LRD\|RECHERCHE\)/);
 const memberRoute=source('src/member-dashboard-routes.js');
 assert.match(memberRoute,/getVerifiedLrdIds\(snapshot\.data\)/);
 assert.match(memberRoute,/app\.get\('\/api\/member\/personnel-list',memberIdentity/);
 assert.doesNotMatch(memberRoute,/\.post\(/);
});
