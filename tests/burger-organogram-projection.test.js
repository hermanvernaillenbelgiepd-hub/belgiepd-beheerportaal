import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCitizenOrganogram,citizenGroupsForRoles,BURGER_ROLE_IDS} from '../src/burger-organogram-projection.js';
const guild='1309532438019706999',a='1309532438019706001',b='1309532438019706002';
const person=(id,dept,name)=>({personId:id,dept,name,call:'S-400',rank:'Inspecteur'});
const api=(entries)=>({status:'ok',entries:new Map(entries)});
test('Burgerraad is added from a known police identity without a separate Burger roster row',()=>{
 const rows=[person(a,'politie','Voorbeeld')];
 const result=projectCitizenOrganogram(rows,api([[a,[BURGER_ROLE_IDS.council,BURGER_ROLE_IDS.member]]]),null,guild);
 assert.equal(result.length,2);
 assert.deepEqual(result[1],{
  dept:'burger',personId:a,name:'Voorbeeld',call:'—',rank:'Burgerraad',
  series:'',status:'',specialties:[],citizenDisplayOnly:true
 });
 assert.equal(rows.length,1);
});
test('existing Burger personnel record is retained without duplication',()=>{
 const rows=[person(a,'politie','Voorbeeld'),person(a,'burger','Burger Voorbeeld')];
 const result=projectCitizenOrganogram(rows,api([[a,[BURGER_ROLE_IDS.council]]]),null,guild);
 assert.equal(result.length,2);
});
test('group priority is Burgerraad, Burger, Burger IO',()=>{
 assert.deepEqual(citizenGroupsForRoles([BURGER_ROLE_IDS.trainee,BURGER_ROLE_IDS.member,BURGER_ROLE_IDS.council]),
  ['Burgerraad','Burger','Burger IO']);
});
test('no anonymous members, invented names, or stale OAuth evidence are promoted',()=>{
 const rows=[person(a,'politie','Voorbeeld'),person(b,'politie','Test')];
 const stale={entries:new Map([[a,{guildId:guild,verifiedAt:1,roleIds:[BURGER_ROLE_IDS.council]}]])};
 const result=projectCitizenOrganogram(rows,{status:'unavailable'},stale,guild,Date.now());
 assert.equal(result.length,2);
});
test('recent guild-matched OAuth role is an allowed display fallback',()=>{
 const rows=[person(a,'politie','Voorbeeld')],at=Date.now();
 const auth={entries:new Map([[a,{guildId:guild,verifiedAt:at,roleIds:[BURGER_ROLE_IDS.council]}]])};
 const result=projectCitizenOrganogram(rows,{status:'unavailable'},auth,guild,at);
 assert.equal(result[1]?.rank,'Burgerraad');
});
