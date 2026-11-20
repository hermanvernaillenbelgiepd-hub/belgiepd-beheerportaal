import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cadreActivityDefaults,cadreActivitySettings,CADRE_ACTIVITY_OPTIONAL,
 canManageCadreActivity,canReadCadreActivity,isCadreActivitySubject,
 validateCadreActivityToggle,cadreActivityPeriod,cadreActivityCounts}
 from '../src/cadre-activity-policy.js';

const officerId='123456789012345678',midId='234567890123456789',
 serviceId='345678901234567890',memberId='456789012345678901';
const policeOfficer=(changes={})=>({
 uid:'discord:'+officerId,discordId:officerId,role:'officierenkader',
 departments:['politie'],departmentRoles:{politie:'officierenkader'},
 discordPoliceRank:'officierenkader',dossierAllowedDepartments:['politie','brandweer'],
 ...changes
});
const policeRoster=(call='930',rank='Aspirant Commissaris')=>
 [{dept:'politie',personId:officerId,call,rank,status:'ACTIEF',name:'Officer'},
  {dept:'politie',personId:midId,call:'720',rank:'Hoofdinspecteur',
   status:'ACTIEF',name:'Middenkaderlid',series:'Reeks 2'}];

test('Politie blijft ingeschakeld en nevendiensten starten uit',()=>{
 const initial=cadreActivitySettings(undefined);
 assert.equal(initial.enabled.politie,true);
 for(const dept of CADRE_ACTIVITY_OPTIONAL)assert.equal(initial.enabled[dept],false);
 assert.deepEqual(initial.enabled,cadreActivityDefaults());
 assert.equal(cadreActivitySettings({revision:2,enabled:{
   politie:false,brandweer:true,ambulance:true}}).enabled.politie,true);
 assert.throws(()=>validateCadreActivityToggle({
   department:'politie',enabled:false,reason:'De politie uitschakelen',
   expectedRevision:0}));
 assert.deepEqual(validateCadreActivityToggle({
   department:'brandweer',enabled:true,reason:'Dienstleiding mag dit volgen',
   expectedRevision:0}),{
   department:'brandweer',enabled:true,reason:'Dienstleiding mag dit volgen',
   expectedRevision:0});
});

test('Politionele Officierenkader/Korpsleiding volgen live rang EN geverifieerde Discordrol',()=>{
 const actor=policeOfficer(),roster=policeRoster();
 assert.equal(canManageCadreActivity(actor,roster),true);
 assert.equal(canReadCadreActivity(actor,'politie',{},roster),true);
 assert.equal(canManageCadreActivity(actor,policeRoster('720','Hoofdinspecteur')),false);
 assert.equal(canManageCadreActivity(actor,policeRoster('930','Hoofdinspecteur')),false); // Rang is gewijzigd, callsign loopt achter
 assert.equal(canReadCadreActivity(actor,'politie',{},policeRoster('720','Hoofdinspecteur')),false);
 assert.equal(canManageCadreActivity(policeOfficer({
   role:'middenkader',departmentRoles:{politie:'middenkader'},
   discordPoliceRank:'middenkader'}),roster),false);
 assert.equal(canManageCadreActivity(policeOfficer({discordPoliceRank:null}),roster),false);
 assert.equal(canManageCadreActivity(policeOfficer({uid:'discord:000000000000000000'}),roster),false);
 assert.equal(canManageCadreActivity(policeOfficer({role:'beheerder',portalTechnicalMode:true,
   operationalRole:'officierenkader',operationalDepartmentRoles:{politie:'officierenkader'},
   profileTechnicalAvailable:true}),roster),true);
 assert.equal(canManageCadreActivity(policeOfficer({role:'beheerder',
   portalTechnicalMode:true,operationalRole:'beheerder',profileTechnicalAvailable:true}),roster),false);
});
test('Nevendiensten krijgen alleen inzage met aan-schakelaar én actuele eigen rang',()=>{
 const settings=cadreActivitySettings({enabled:{depannage:true,burger:true}});
 const actor={uid:'discord:'+serviceId,discordId:serviceId,
   role:'korpsleiding',departments:['depannage'],
   departmentRoles:{depannage:'korpsleiding'},
   reportServiceRoles:{depannageAwv:true}};
 const roster=[{dept:'depannage',personId:serviceId,
   call:'AWV-01',rank:'AWV Leiding',status:'ACTIEF'}];
 assert.equal(canReadCadreActivity(actor,'depannage',settings,roster),true);
 assert.equal(canReadCadreActivity(actor,'depannage',
   cadreActivitySettings({enabled:{depannage:false}}),roster),false);
 assert.equal(canReadCadreActivity(actor,'depannage',settings,
   [{...roster[0],call:'LSRA-04',rank:'Depanneur'}]),false);
 assert.equal(canReadCadreActivity(actor,'brandweer',settings,roster),false);
 const citizen={uid:'discord:'+memberId,discordId:memberId,
   role:'basiskader',departments:['burger'],citizenCouncilVerified:true};
 assert.equal(canReadCadreActivity(citizen,'burger',settings,
   [{dept:'burger',personId:memberId,rank:'Burgerraad',status:'ACTIEF'}]),true);
 assert.equal(canReadCadreActivity(citizen,'burger',settings,
   [{dept:'burger',personId:memberId,rank:'Burger in opleiding',status:'ACTIEF'}]),false);
});
test('Promotie of degradatie vervangt direct de Middenkaderselectie',()=>{
 const officer={dept:'politie',personId:officerId,name:'Officer',
   call:'930',rank:'Aspirant Commissaris',status:'ACTIEF'};
 const member={dept:'politie',personId:midId,name:'Collega',
   call:'434',rank:'Inspecteur',status:'ACTIEF'};
 assert.equal(isCadreActivitySubject(officer),false);
 assert.equal(isCadreActivitySubject(member),false);
 assert.equal(isCadreActivitySubject({...member,call:'720',rank:'Hoofdinspecteur'}),true);
 assert.equal(isCadreActivitySubject({...member,call:'720',rank:'Inspecteur'}),false);
 assert.equal(isCadreActivitySubject({...member,call:'720',rank:'Hoofdinspecteur',
   lifecycleState:'archived'}),false);
 assert.equal(isCadreActivitySubject({...member,call:'720',rank:'Hoofdinspecteur',
   status:'ONTSLAG'}),false);
 assert.equal(isCadreActivitySubject({...member,call:'930',rank:'Hoofdinspecteur'}),false);
});
test('Historische overnames en correcties verhogen inhoudelijke prestaties niet',()=>{
 const p={dept:'politie',personId:midId,name:'Collega',
   call:'720',rank:'Hoofdinspecteur',status:'ACTIEF'};
 const period=cadreActivityPeriod(30,'2026-11-20');
 const events=[
   {type:'observatie',eventDate:'2026-11-19',registeredBy:{discordId:midId}},
   {type:'notitie',eventDate:'2026-11-19',registeredBy:{discordId:midId}},
   {type:'sanctie',eventDate:'2026-11-19',registeredBy:{discordId:midId}},
   {type:'observatie',eventDate:'2026-11-19',historicalImport:true,
     registeredBy:{discordId:officerId},submittedByActor:{discordId:midId}},
   {type:'observatie',eventDate:'2026-11-20',registeredBy:{discordId:midId},
     source:'observation-amendment',amendmentOf:{entryId:'orig'}},
   {type:'observatie',eventDate:'2026-09-02',registeredBy:{discordId:midId}},
   {type:'observatie',eventDate:'2026-11-20',registeredBy:{discordId:midId},
     testRecord:true}
 ];
 const trainings=[
   {eventDate:'2026-11-18',registeredByDiscordId:midId},
   {eventDate:'2026-11-18',registeredByDiscordId:midId,archivedAt:'2026-11-19'},
   {eventDate:'2026-11-18',registeredByDiscordId:officerId}
 ];
 const [r]=cadreActivityCounts([p],events,trainings,period);
 assert.equal(r.observaties,1);assert.equal(r.notities,1);
 assert.equal(r.sancties,1);assert.equal(r.opleidingsregistraties,1);
 assert.equal(r.overgenomen,1);assert.equal(r.correcties,1);
 assert.equal(r.actieveRegistratiedagen,2);
 assert.equal(r.totaal,4);
});
test('Alle API-calls blijven achter dezelfde serverauthenticatie',()=>{
 const src=readFileSync(new URL('../src/cadre-activity-routes.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');
 assert.match(index,/installCadreActivityRoutes\(app,\{requireUser:requireDossierUser,getSnapshot\}\)/);
 for(const name of ['config','overview'])
   assert.match(src,new RegExp("app\\.get\\('/api/cadre-activity/"+name+"',requireUser"));
 assert.match(src,/app\.put\('\/api\/cadre-activity\/config',requireUser/);
 assert.match(src,/if\(!canManageCadreActivity\(req\.bpd,roster\)\)return fail\(res,403\)/);
 assert.match(src,/if\(!canReadCadreActivity\(req\.bpd,dept,cadreActivitySettings\(saved\.data\(\)\),roster\)\)/);
 assert.match(src,/tx\.create\(audit,/);
 assert.match(src,/settingsRef\(\)/);
 assert.match(ui,/id="cadreVisibility"/);
 assert.match(ui,/id="cadreSettingReason"/);
 assert.match(ui,/id="cadrePanel"/);
});
