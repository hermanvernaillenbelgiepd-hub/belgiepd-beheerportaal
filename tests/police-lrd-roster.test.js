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

test('Openbare personeelslijst toont LRD uitsluitend na recente Discord-verificatie',()=>{
 const verified=new Set([first]);verified.confirmedIds=new Set([first,second]);
 const records=publicPoliceRoster([person(first),person(second)],[],new Set(),verified);
 assert.equal(records.length,2);
 assert.equal(PUBLIC_POLICE_SPECIALTIES.includes(LRD_SPECIALTY_LABEL),true);
 for(const row of records){
   assert.equal(row.specialties.length,12);
   assert.deepEqual(Object.keys(row).sort(),
     ['call','name','rank','series','status','hasPoliceEntry','services','specialties'].sort());
   assert.doesNotMatch(JSON.stringify(row),/111111111111111111|222222222222222222|NO_LEAK|roleIds/);
 }
 assert.equal(records[0].specialties.find(x=>x.label===LRD_SPECIALTY_LABEL)?.value,'Ja');
 assert.equal(records[1].specialties.find(x=>x.label===LRD_SPECIALTY_LABEL)?.value,'Nee');
 const forged=publicPoliceRoster([{...person(second),
   specialties:[{label:LRD_SPECIALTY_LABEL,value:'Ja'}]}]);
 assert.equal(forged[0].specialties.find(x=>x.label===LRD_SPECIALTY_LABEL)?.value,'Niet gecontroleerd');
});

test('Protected personnel table omits LRD while individual speciality policy is retained',()=>{
 const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const server=source('src/server.js'),manager=source('src/personnel-editor-routes.js');
 const display=source('public/personnel-list-visuals.js');
 const memberRoute=source('src/member-dashboard-routes.js');
 const managerPage=source('public/personeelsbeheer.html');
 assert.equal(server.includes('readVerifiedPoliceLrd(roster)'),false);
 assert.equal(manager.includes('lrdDiscordVerified:lrdVerified'),false);
 assert.equal(managerPage.includes("x.label!=='LRD (Recherche)'"),true);
 assert.equal(display.includes("'TO','AE','LRD (Recherche)'"),false);
 assert.equal(memberRoute.includes('getVerifiedLrdIds(snapshot.data)'),false);
 assert.equal(memberRoute.includes("app.get('/api/member/personnel-list',memberIdentity"),true);
 assert.equal(memberRoute.includes('.post('),false);
});
