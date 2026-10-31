import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {serviceHierarchy,orderedMembers,policeSpecialtyName}
 from '../public/assets/organogram-hierarchie-model.js';
import {validatePlacement,manualDisplay,mergePlacement,canManagePlacements,
 verifiedSyncRoles} from '../src/organogram-placement-policy.js';

const txt=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const id='111111111111111111',guild='222222222222222222';
test('Main has only the operational hierarchy with fresh woven-nameplate renderer',()=>{
 const classic=txt('../public/organogram.html');
 const next=txt('../public/organogram-hierarchie.html');
 const home=txt('../public/index.html');
 assert.match(classic,/name-autofit-20261031-v5/);
 assert.match(classic,/Nieuw organogram/);
 assert.doesNotMatch(next,/Klassiek organogram/);
 assert.match(classic,/location\.replace\('\/organogram-hierarchie\.html'/);
 assert.match(next,/\/assets\/organogram-police-formal\.js\?v=name-autofit-20261031-v5/);
 assert.match(next,/\/assets\/organogram-police-formal\.css\?v=name-autofit-20261031-v5/);
 assert.match(next,/BPDPoliceUniform\?\.makePortrait/);
 assert.match(home,/\/organogram-hierarchie\.html/);
 assert.doesNotMatch(home,/href="\/organogram\.html"/);
});
test('police has fixed specialization order, radio/BM included in intervention, with teachers first',()=>{
 const p=serviceHierarchy([
  {dept:'politie',name:'Hoofd',call:'900',rank:'Hoofdcommissaris'},
  {dept:'politie',name:'Instructeur',call:'450',teachingRoles:['instructeur'],specialties:['Radio BM'],displayOrder:3},
  {dept:'politie',name:'Lid',call:'700',specialties:['RADIO/BM']},
  {dept:'politie',name:'Ander',call:'400',specialties:['Motor'],displayOrder:1},
  {dept:'politie',name:'Rechercher',call:'600',specialties:['Lokale Recherche']}
 ],'politie');
 assert.equal(p.leadership[0].members[0].call,'900');
 assert.deepEqual(p.branches.slice(0,10).map(x=>x.label),
  ['INTERVENTIEDIENST','SIGNALISATIE','MOTARD','SEMI ANONIEM',
   'K9','RAGO','DISP','TO','AE','RECHERCHE']);
 assert.deepEqual(p.branches[0].members.map(x=>x.call),['450','700']);
 assert.equal(p.branches[0].note,'RADIO/BM inbegrepen');
 assert.equal(p.branches[0].children,undefined);
 assert.equal(p.branches[9].members[0].call,'600');
 assert.equal(policeSpecialtyName('SIV/WPR'),'SIGNALISATIE');
 assert.equal(policeSpecialtyName('Motor'),'MOTARD');
});
test('manual display position sorts WITHIN instructor/member group, 0 restores default order',()=>{
 const list=[
  {dept:'politie',name:'Lid hoog',call:'700',displayOrder:0},
  {dept:'politie',name:'Lid laag',call:'400',displayOrder:1},
  {dept:'politie',name:'Instructeur',call:'300',displayOrder:999,teachingRoles:['instructeur']}
 ];
 assert.deepEqual(orderedMembers(list).map(p=>p.call),['300','400','700']);
 list[1].displayOrder=0;
 assert.deepEqual(orderedMembers(list).map(p=>p.call),['300','700','400']);
});
test('manual instructor and placement are reversible without granting operational rights',()=>{
 const body={boardRole:'none',leadershipTier:'none',displayOrder:1,
  teachingRoles:['instructeur'],specialties:['MOTARD'],reason:'Handmatige instructeur bij syncstoring'};
 const saved=validatePlacement(body,'politie');
 assert.equal(saved.displayOrder,1);
 assert.throws(()=>validatePlacement({...body,displayOrder:-1},'politie'));
 assert.throws(()=>validatePlacement({...body,displayOrder:1000},'politie'));
 assert.throws(()=>validatePlacement({...body,displayOrder:1.5},'politie'));
 assert.throws(()=>validatePlacement({...body,specialties:['Duiker']},'politie'));
 const person={dept:'politie',name:'Voorbeeld',call:'400',specialties:[]};
 const manual=manualDisplay({...saved,dept:'politie',status:'active'},'politie');
 const auto=verifiedSyncRoles(null,'politie',guild);
 const merged=mergePlacement(person,manual,auto);
 assert.equal(merged.displayOrder,1);
 assert.deepEqual(merged.teachingRoles,['instructeur']);
 assert.equal(merged.source,'handmatig');
 assert.equal(canManagePlacements({role:'middenkader',uid:'discord:'+id}),false);
 assert.equal(canManagePlacements({role:'beheerder',uid:'discord:'+id}),true);
 const reset=validatePlacement({...body,teachingRoles:[],displayOrder:0,specialties:[]},'politie');
 assert.equal(reset.displayOrder,0);
});
test('protected endpoints use authenticated read, technical write and transaction undo',()=>{
 const server=txt('../src/server.js');
 const routes=txt('../src/organogram-placement-routes.js');
 const ui=txt('../public/organogram-hierarchie.html');
 assert.match(server,/installOrganogramPlacementRoutes\(app,\{requireUser,getSnapshot\}\)/);
 assert.match(routes,/app\.get\('\/api\/organogram\/hierarchie',requireUser/);
 assert.match(routes,/app\.put\('\/api\/organogram\/placements\/:dept\/:personId',requireUser,manager/);
 assert.match(routes,/app\.post\('\/api\/organogram\/placements\/:dept\/:personId\/undo',requireUser,manager/);
 assert.match(routes,/action:'manual_display_undo'/);
 assert.match(routes,/action:'manual_display_assignment'/);
 assert.match(routes,/undo:rawDisplay\(before\)/);
 assert.match(routes,/p\.dept!=='burger'/);
 assert.match(routes,/accessRightsChanged:false/);
 assert.match(ui,/↩ Vorige instelling herstellen/);
 assert.match(ui,/manage-instructor/);
 assert.match(ui,/manage-teacher/);
 assert.match(ui,/manage-order/);
 assert.match(ui,/method:'POST'/);
 assert.match(ui,/authFetch\('\/api\/organogram\/hierarchie'\)/);
 assert.doesNotMatch(ui,/fetch\('\/api\/organogram\/hierarchie'/);
 const client=ui.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(client);
 assert.doesNotThrow(()=>new Script(client.replace(/^import[^\n]+\n/m,'')));
});
