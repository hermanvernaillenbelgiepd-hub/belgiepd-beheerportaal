import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personKey,validatePlacement,manualDisplay,verifiedSyncRoles,mergePlacement,
 canManagePlacements,BOARD_DISCORD_ROLE} from '../src/organogram-placement-policy.js';

const ID='111111111111111111',GUILD='222222222222222222';
const sample={dept:'politie',personId:ID,name:'Voorbeeld',rank:'Hoofdinspecteur',
 call:'701',specialties:[{label:'Motor',value:'Ja'},{label:'Dossiernotitie',value:'Ja'}]};
test('only known service/person IDs and validated display fields can be assigned',()=>{
 assert.equal(personKey('politie',ID),'politie_'+ID);
 assert.equal(personKey('bestuur',ID),'bestuur_'+ID);
 assert.equal(personKey('unknown',ID),null);
 assert.equal(personKey('politie','Voorbeeld'),null);
 const value=validatePlacement({boardRole:'none',leadershipTier:'none',teachingRoles:['instructeur','docent'],
  specialties:['MOTARD','K9'],reason:'Tijdelijke handmatige synchronisatie.'},'politie');
 assert.deepEqual(value.teachingRoles,['instructeur','docent']);
 assert.throws(()=>validatePlacement({...value,specialties:['K9','K9']},'politie'));
 assert.throws(()=>validatePlacement({...value,specialties:['Duiker']},'politie'));
 assert.throws(()=>validatePlacement({...value,role:'beheerder'},'politie'));
 assert.throws(()=>validatePlacement({...value,reason:'kort'},'politie'));
 assert.throws(()=>validatePlacement({...value,teachingRoles:['bestuur']},'politie'));
 assert.throws(()=>validatePlacement({...value,leadershipTier:'AZLS-leiding'},'politie'));
 assert.doesNotThrow(()=>validatePlacement({...value,leadershipTier:'Middenkader'},'politie'));

 assert.doesNotThrow(()=>validatePlacement({boardRole:'bestuur-ai',leadershipTier:'none',teachingRoles:[],
  specialties:[],reason:'Handmatige bestuursweergave'},'bestuur'));
 assert.doesNotThrow(()=>validatePlacement({boardRole:'none',leadershipTier:'none',teachingRoles:[],
  specialties:[],reason:'Functie ingetrokken'},'bestuur'));
 assert.throws(()=>validatePlacement({...value,teachingRoles:['docent']},'bestuur'));
});
test('verified role sync adds explicit instructor & board; stale sync is ignored',()=>{
 const verifiedAt=Date.now();
 const roleIds=[BOARD_DISCORD_ROLE,'1359656762289946755'];
 const present=verifiedSyncRoles({guildId:GUILD,roleIds,verifiedAt},'politie',GUILD,verifiedAt+1000);
 assert.equal(present.boardRole,'bestuur');
 assert.deepEqual(present.teachingRoles,['instructeur']);
 assert.deepEqual(present.specialties,['MOTARD']);
 assert.equal(present.synced,true);
 const failed=verifiedSyncRoles({guildId:GUILD,roleIds,verifiedAt:verifiedAt-9*86400000},
  'politie',GUILD,verifiedAt);
 assert.equal(failed.synced,false);
 assert.equal(failed.boardRole,'none');
 assert.deepEqual(failed.teachingRoles,[]);
 assert.equal(verifiedSyncRoles({guildId:'wrong',roleIds,verifiedAt},'politie',GUILD).synced,false);
});
test('verified member Discord roles populate only established police branches',()=>{
 const verifiedAt=Date.now();
 const roles=['1358148694297415741','1309532437977497699','1309532437977497700',
  '1309532438019706963','1309542190409580594','1309532438019706962',
  '1380843428354592780','1537606324886442035'];
 const result=verifiedSyncRoles({guildId:GUILD,roleIds:roles,verifiedAt},
  'politie',GUILD,verifiedAt);
 assert.deepEqual(result.specialties,['MOTARD','K9','RAGO','DISP','AE','TO','RECHERCHE']);
 assert.equal(result.teachingRoles.length,0);
 assert.equal(result.specialties.includes('RADIO/BM'),false);
});
test('manual role remains visible when the Discord sync has failed',()=>{
 const manual=manualDisplay({dept:'politie',status:'active',boardRole:'bestuur-ai',
  teachingRoles:['docent'],specialties:['Dispatch']},'politie');
 const offline=verifiedSyncRoles(null,'politie',GUILD);
 const merged=mergePlacement(sample,manual,offline);
 assert.equal(merged.boardRole,'bestuur-ai');
 assert.deepEqual(merged.teachingRoles,['docent']);
 assert.deepEqual(merged.specialties,['DISP','MOTARD']);
 assert.equal(merged.source,'handmatig');
 assert.equal(Object.hasOwn(merged,'personId'),false);
 assert.equal(Object.hasOwn(merged,'roleIds'),false);
 assert.equal(Object.hasOwn(merged,'email'),false);
});
test('manual and Discord roles coexist; manual flags do not create portal access',()=>{
 const manual=manualDisplay({dept:'politie',status:'active',boardRole:'none',
  teachingRoles:['docent'],specialties:['K9']},'politie');
 const auto={boardRole:'bestuur',teachingRoles:['instructeur'],
  specialties:['Motor'],synced:true};
 const merged=mergePlacement(sample,manual,auto);
 assert.equal(merged.boardRole,'bestuur');
 assert.deepEqual(merged.teachingRoles,['docent','instructeur']);
 assert.deepEqual(merged.specialties,['K9','MOTARD']);
 assert.equal(merged.source,'handmatig + Discord');
 assert.equal(canManagePlacements({role:'korpsleiding',uid:'discord:'+ID}),false);
 assert.equal(canManagePlacements({role:'beheerder',uid:'discord:'+ID}),true);
 assert.equal(canManagePlacements({role:'beheerder'}),false);
});
test('endpoints are separated and writes are guarded, audited, and never touch dossier grants',()=>{
 const s=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/organogram-hierarchie-proef.html',import.meta.url),'utf8');
 assert.match(s,/app\.get\('\/api\/organogram\/hierarchie',async/);
 assert.match(s,/app\.get\('\/api\/organogram\/placements\/admin',requireUser,manager/);
 assert.match(s,/app\.put\('\/api\/organogram\/placements\/:dept\/:personId',requireUser,manager/);
 assert.match(s,/tx\.create\(ref\.collection\('audit'\)\.doc\(\)/);
 assert.match(s,/displayOnly:true,accessRightsChanged:false/);
 assert.match(s,/personKey\(dept,personId\)/);
 assert.match(s,/personId:p\.personId/);
 assert.match(s,/records,board:\[\.\.\.boardById\.values\(\)\]/);
 assert.doesNotMatch(s,/tx\.set\(.*USER_COLLECTION|tx\.update\(.*USER_COLLECTION/);
 assert.match(server,/installOrganogramPlacementRoutes\(app,\{requireUser,getSnapshot\}\)/);
 assert.match(html,/setupPortalLogin/);
 assert.match(html,/api\/organogram\/placements\/admin/);
 assert.match(html,/method:'PUT'/);
 assert.match(html,/Motivering voor logboek/);
 assert.match(html,/Board|Bestuur ad interim/);
});
