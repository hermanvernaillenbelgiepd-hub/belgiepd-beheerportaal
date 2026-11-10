import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCitizenOrganogram,overlayVerifiedCitizenRankDisplay,citizenGroupsForRoles,citizenOrganogramGroups,BURGER_ROLE_IDS} from '../src/burger-organogram-projection.js';
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

test('existing citizen role Burgerraad is projected by exact verified Discord-ID, not nickname',()=>{
 const old=[person(a,'politie','Jones'),{...person(a,'burger','Jones'),rank:'Burger'}];
 const result=projectCitizenOrganogram(old,api([[a,[BURGER_ROLE_IDS.member,BURGER_ROLE_IDS.council]]]),null,guild);
 assert.equal(result.length,2);
 assert.equal(result[1].rank,'Burgerraad');
 assert.equal(result[1].citizenRoleSource,'discord-api-display');
 assert.equal(old[1].rank,'Burger'); // no Firestore/personnel mutation
 const absence=projectCitizenOrganogram(old,api([[a,[BURGER_ROLE_IDS.member]]]),null,guild);
 assert.equal(absence[1].rank,'Burger');
 const outage=projectCitizenOrganogram(old,{status:'unavailable',entries:new Map()},null,guild);
 assert.equal(outage[1].rank,'Burger');
});

test('citizen role overlay on personnel overview is display-only, after permission decisions',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const editor=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 assert.doesNotMatch(server,/overlayVerifiedCitizenRankDisplay/);
 assert.match(editor,/presentation=overlayVerifiedCitizenRankDisplay\(records,roleDisplay\)/);
 assert.ok(editor.indexOf("const records=mergePersonnelEdits(base,overlay)")<
  editor.indexOf("presentation=overlayVerifiedCitizenRankDisplay(records,roleDisplay)"));
});
test('citizen overview projection accepts discordId without altering permissions',()=>{
 const source={dept:'burger',discordId:a,rank:'Burger',canEdit:false,canChangeRank:false};
 const rows=overlayVerifiedCitizenRankDisplay([source],api([[a,[BURGER_ROLE_IDS.council]]]));
 assert.equal(rows[0].rank,'Burgerraad');
 assert.equal(rows[0].canEdit,false);
 assert.equal(rows[0].canChangeRank,false);
 assert.equal(source.rank,'Burger');
});

test('registered Burgerraad from the citizen personnel source survives missing Discord role',()=>{
 const row={...person(a,'burger','Jones'),rank:'—',
  specialties:[{label:'Burgerraad',value:'Ja'}]};
 assert.deepEqual(citizenOrganogramGroups(row,[]),['Burgerraad']);
 assert.deepEqual(citizenOrganogramGroups(row,['Burger']),['Burgerraad','Burger']);
 assert.deepEqual(citizenOrganogramGroups({...row,specialties:[{label:'Burgerraad',value:'Nee'}]},['Burger']),['Burger']);
 assert.deepEqual(citizenOrganogramGroups({...row,dept:'politie'},[]),[]);
});
