import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPoliceLrdIndex,fetchBotLrdGuildSnapshot,
  LRD_DISCORD_ROLE_ID,LRD_SPECIALTY_LABEL} from '../src/police-lrd-policy.js';
import {publicPoliceRoster} from '../src/member-dashboard-routes.js';
import {allowedSpecialty,validateSpecialtyChange,publicSpecializations} from '../src/specialization-policy.js';

const guild='123456789012345678',token='x'.repeat(40);
const first='111111111111111111',second='222222222222222222';
const firstPerson={dept:'politie',personId:first,call:'438',name:'Recherchelid',
  rank:'Inspecteur',series:'Reeks 1',status:'ACTIEF',specialties:[]};
const secondPerson={...firstPerson,personId:second,call:'439',name:'Collega'};
const roster=[firstPerson,secondPerson];
const response=(data,status=200)=>new Response(JSON.stringify(data),
  {status,headers:{'content-type':'application/json'}});
const staleDb=()=>({
  collection:()=>({doc:id=>({id})}),
  getAll:async(...refs)=>refs.map(()=>({exists:true,data:()=>({
    guildId:guild,verifiedAt:100,roleIds:[]})}))
});

test('Bot role shows JA without requiring new portal login; confirmed nonmember shows NEE',async()=>{
 let now=1800000000000,calls=0,roles=[LRD_DISCORD_ROLE_ID];
 const api=async(url,options)=>{
   calls++;
   assert.match(url,/\/guilds\/123456789012345678\/members\?limit=1000/);
   assert.equal(options.headers.Authorization,'Bot '+token);
   assert.equal(options.redirect,'error');
   return response([{user:{id:first},roles},
     {user:{id:second},roles:[]}]);
 };
 const lookup=createPoliceLrdIndex({firestore:staleDb,guildId:()=>guild,
   botToken:()=>token,fetchImpl:api,now:()=>now});
 const firstCheck=await lookup(roster);
 assert.equal(firstCheck.source,'discord-bot');
 assert.deepEqual([...firstCheck],[first]);
 assert.equal(firstCheck.confirmedIds.size,2);
 const view=publicPoliceRoster(roster,firstCheck);
 assert.equal(view[0].specialties.find(s=>s.label===LRD_SPECIALTY_LABEL).value,'Ja');
 assert.equal(view[1].specialties.find(s=>s.label===LRD_SPECIALTY_LABEL).value,'Nee');
 assert.doesNotMatch(JSON.stringify(view),/111111111111111111|222222222222222222/);
 await lookup(roster);
 assert.equal(calls,1,'Short-lived repeated reads must not hammer Discord');
 roles=[];
 now+=91000;
 const revoked=await lookup(roster);
 assert.equal(revoked.has(first),false,'Revocation must be visible after cache expiry');
 assert.equal(revoked.confirmedIds.has(first),true);
 assert.equal(calls,2);
});

test('Discord member pagination includes LRD members after first 1000',async()=>{
 const start=100000000000000000n;
 const rows=Array.from({length:1000},(_,i)=>({
   user:{id:String(start+BigInt(i))},roles:[]
 }));
 let calls=0;
 const present=await fetchBotLrdGuildSnapshot(guild,token,{
   fetchImpl:async(url)=>{
     calls++;
     return response(calls===1?rows:[{user:{id:first},roles:[LRD_DISCORD_ROLE_ID]}]);
   }
 });
 assert.equal(calls,2);
 assert.equal(present.has(first),true);
});

test('If guild-member enumeration is restricted, bot checks individual roster members',async()=>{
 let now=1800000000000,requests=0;
 const lookup=createPoliceLrdIndex({
   firestore:staleDb,now:()=>now,guildId:()=>guild,botToken:()=>token,
   fetchImpl:async url=>{
     requests++;
     if(url.includes('members?'))return response({message:'Missing Access'},403);
     const id=url.slice(url.lastIndexOf('/')+1);
     return response({user:{id},roles:id===first?[LRD_DISCORD_ROLE_ID]:[]});
   }
 });
 const found=await lookup(roster);
 assert.equal(found.source,'discord-bot-direct');
 assert.equal(found.has(first),true);
 assert.equal(found.confirmedIds.size,2);
 assert.equal(requests,3);
});

test('Bot errors cannot fabricate a NEE status from an expired OAuth snapshot',async()=>{
 const lookup=createPoliceLrdIndex({
   firestore:staleDb,guildId:()=>guild,botToken:()=>token,
   now:()=>1800000000000,
   fetchImpl:async()=>response({message:'Rate limited'},429)
 });
 const statuses=await lookup(roster);
 assert.equal(statuses.confirmedIds.size,0);
 const view=publicPoliceRoster(roster,statuses);
 assert.equal(view[0].specialties.find(s=>s.label===LRD_SPECIALTY_LABEL).value,
   'Niet gecontroleerd');
});

test('LRD is auto-managed; manual LRD toggles are rejected at the server',()=>{
 assert.equal(allowedSpecialty('politie',LRD_SPECIALTY_LABEL),false);
 assert.equal(allowedSpecialty('politie','K9'),true);
 const oldManual=publicSpecializations(firstPerson,{revision:1,values:{
   [LRD_SPECIALTY_LABEL]:{value:'Ja',source:'manual'}
 }});
 const lrd=oldManual.items.find(row=>row.label===LRD_SPECIALTY_LABEL);
 assert.equal(lrd.value,'Niet gecontroleerd');
 assert.equal(lrd.readOnly,true);

 assert.throws(()=>validateSpecialtyChange({
  label:LRD_SPECIALTY_LABEL,value:'Ja',expectedRevision:0,
  reason:'Manuele activatie mag geen echte rol vervangen'
 },'politie'),/Onbekende specialisatie/);
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(page,/x\.label!=='LRD \(Recherche\)'/);
 assert.match(page,/Automatisch via Discord-bot/);
});
