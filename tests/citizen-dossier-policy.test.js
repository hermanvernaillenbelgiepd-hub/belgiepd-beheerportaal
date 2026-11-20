import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITIZEN_ROLES,verifiedCitizenCouncil,canAccessCitizenDossier,
  canWriteCitizenDossier,canDeleteCitizenEntry,canManageCitizenDeletions,
  citizenMemberType,citizenSubject,validateCitizenEntry,validateCitizenDeletion,
  observationAverage,citizenDossierRole,CITIZEN_DOSSIER_ROLE_LABELS,validateCitizenProfile
} from '../src/citizen-dossier-policy.js';

const now=Date.parse('2026-11-04T12:00:00.000Z');
const guildId='123456789012345678';
const id='223456789012345678';
const actor={uid:'discord:'+id,discordId:id,role:'basiskader',
  departments:['politie'],portalTechnicalMode:false};
const member=(ids,age=500)=>({guildId,verifiedAt:now-age,roleIds:ids});

test('burgerraad role requires fresh, guild-bound own Discord member evidence',()=>{
  assert.equal(verifiedCitizenCouncil(actor,member([CITIZEN_ROLES.burgerraad]),guildId,now),true);
  assert.equal(verifiedCitizenCouncil(actor,member([CITIZEN_ROLES.burger]),guildId,now),false);
  assert.equal(verifiedCitizenCouncil(actor,member([CITIZEN_ROLES.burgerraad],16*60*1000),guildId,now),false);
  assert.equal(verifiedCitizenCouncil(actor,{...member([CITIZEN_ROLES.burgerraad]),guildId:'999999999999999999'},guildId,now),false);
  assert.equal(verifiedCitizenCouncil({...actor,uid:'discord:999999999999999999'},member([CITIZEN_ROLES.burgerraad]),guildId,now),false);
  assert.equal(verifiedCitizenCouncil({...actor,uid:'google:account'},member([CITIZEN_ROLES.burgerraad]),guildId,now),false);
  assert.equal(verifiedCitizenCouncil(actor,member([CITIZEN_ROLES.burgerraad],-2000),guildId,now),false);
});
test('council permissions never follow police or generic board roles',()=>{
  assert.equal(canAccessCitizenDossier({...actor,role:'korpsleiding'},false),false);
  assert.equal(canAccessCitizenDossier({...actor,boardPersonnelAdmin:true},false),false);
  assert.equal(canAccessCitizenDossier(actor,true),true);
  assert.equal(canWriteCitizenDossier(actor,true,id),false);
  assert.equal(canWriteCitizenDossier(actor,true,'323456789012345678'),true);
  assert.equal(canAccessCitizenDossier({...actor,portalTechnicalMode:true,profileTechnicalAvailable:false},false),false);
  assert.equal(canAccessCitizenDossier({...actor,portalTechnicalMode:true,profileTechnicalAvailable:true},false),true);
});
test('Police Korpsleiding may read and write only with independently verified authority',()=>{
  const corps={...actor,role:'korpsleiding',departments:['politie'],
    departmentRoles:{politie:'korpsleiding'},discordPoliceRank:'korpsleiding'};
  assert.equal(canAccessCitizenDossier(corps,false),true);
  assert.equal(canWriteCitizenDossier(corps,false,'323456789012345678'),true);
  assert.equal(canDeleteCitizenEntry(corps,'323456789012345678'),true);
  assert.equal(canWriteCitizenDossier(corps,false,id),false);
  assert.equal(canDeleteCitizenEntry(corps,id),false);
  assert.equal(canAccessCitizenDossier({...corps,discordPoliceRank:null},false),false);
  assert.equal(canAccessCitizenDossier({...corps,departmentRoles:{politie:'basiskader'}},false),false);
  assert.equal(canAccessCitizenDossier({...corps,departments:['brandweer']},false),false);
  assert.equal(canAccessCitizenDossier({...corps,role:'officierenkader'},false),false);
  assert.equal(canAccessCitizenDossier({...corps,uid:'discord:999999999999999999'},false),false);
  assert.equal(canAccessCitizenDossier({...corps,uid:'google:account'},false),false);
  assert.equal(canAccessCitizenDossier({...corps,discordPoliceRank:null,manualCorpsApproved:true},false),true);
  assert.equal(canWriteCitizenDossier({...corps,discordPoliceRank:null,manualCorpsApproved:true},
    false,'323456789012345678'),true);
  // Een goedgekeurd historisch account met precies één politiedienst mag
  // de bestaande serverrolfallback gebruiken, mits Discord-rang bevestigd is.
  assert.equal(canAccessCitizenDossier({...actor,role:'korpsleiding',departments:['politie'],
    discordPoliceRank:'korpsleiding'},false),true);
  // Met meerdere diensten of een ontbrekende politie-rolscope mag dat nooit.
  assert.equal(canAccessCitizenDossier({...corps,departments:['politie','brandweer'],
    departmentRoles:{brandweer:'korpsleiding'}},false),false);
  assert.equal(canAccessCitizenDossier({...actor,boardPersonnelAdmin:true},false),false);
});

test('Burgerraad may save but never delete; verified technical beheer may save and delete',()=>{
  const subject='323456789012345678';
  const technical={...actor,portalTechnicalMode:true,profileTechnicalAvailable:true};
  assert.equal(canAccessCitizenDossier(technical,false),true);
  assert.equal(canWriteCitizenDossier(technical,false,subject),true);
  assert.equal(canDeleteCitizenEntry(technical,subject),true);
  assert.equal(canDeleteCitizenEntry(technical,id),false);
  assert.equal(canWriteCitizenDossier(technical,false,id),false);
  assert.equal(canWriteCitizenDossier(actor,true,subject),true);
  assert.equal(canWriteCitizenDossier(actor,true,id),false);
  assert.equal(canManageCitizenDeletions(actor),false);
  assert.equal(canDeleteCitizenEntry(actor,subject),false);
  assert.equal(canDeleteCitizenEntry({...actor,boardPersonnelAdmin:true},subject),false);
  assert.equal(canDeleteCitizenEntry({...actor,role:'officierenkader'},subject),false);
  assert.equal(canDeleteCitizenEntry({...technical,profileTechnicalAvailable:false},subject),false);
});

test('removal reasons are mandatory, bounded, and cannot smuggle audit properties',()=>{
  assert.deepEqual(validateCitizenDeletion({reason:'  Onjuiste registratie herstellen  '}),
    {reason:'Onjuiste registratie herstellen'});
  assert.throws(()=>validateCitizenDeletion({reason:'te kort'}));
  assert.throws(()=>validateCitizenDeletion({reason:'x'.repeat(501)}));
  assert.throws(()=>validateCitizenDeletion({reason:'geldige reden',byDiscordId:id}));
  assert.throws(()=>validateCitizenDeletion({reason:'geldige\u0000reden'}));
  assert.throws(()=>validateCitizenDeletion([]));
  assert.throws(()=>validateCitizenDeletion(null));
});

test('BIO becomes full Burger if both Discord roles are still assigned',()=>{
  assert.equal(citizenMemberType(member([CITIZEN_ROLES.bio]),guildId,now),'BIO');
  assert.equal(citizenMemberType(member([CITIZEN_ROLES.bio,CITIZEN_ROLES.burger]),guildId,now),'Burger');
  assert.equal(citizenMemberType(member([CITIZEN_ROLES.burgerraad]),guildId,now),'Burgerraad');
  assert.equal(citizenMemberType(member([CITIZEN_ROLES.bio],31*24*60*60*1000),guildId,now),null);
});
test('only a unique, explicit burger personnel key is a citizen subject',()=>{
  const a={dept:'burger',personId:id},b={dept:'politie',personId:id};
  assert.deepEqual(citizenSubject([a,b],id),a);
  assert.equal(citizenSubject([a,a],id),null);
  assert.equal(citizenSubject([b],id),null);
  assert.equal(citizenSubject([a],'123'),null);
});
test('notes, observations, sanctions and promotion remain separate audited entry kinds',()=>{
  const base={eventDate:'2026-11-04',details:'Correct ingeschreven'};
  for(const kind of ['notitie','sanctie_mondeling','sanctie_schriftelijk','volwaardig']){
    assert.deepEqual(validateCitizenEntry({...base,kind}),{...base,kind});
    assert.throws(()=>validateCitizenEntry({...base,kind,score:5}));
  }
  assert.deepEqual(validateCitizenEntry({...base,kind:'observatie',score:0}),
    {...base,kind:'observatie',score:0});
  assert.throws(()=>validateCitizenEntry({...base,kind:'observatie'}));
  assert.throws(()=>validateCitizenEntry({...base,kind:'observatie',score:11}));
  assert.throws(()=>validateCitizenEntry({...base,kind:'notitie',byDiscordId:id}));
  assert.throws(()=>validateCitizenEntry({...base,kind:'notitie',eventDate:'2026-02-30'}));
});
test('observation score average uses only the last three months, excluding notes and sanctions',()=>{
  const options={today:'2026-11-19'};
  const scores=observationAverage([
    {kind:'observatie',eventDate:'2026-09-01',score:10},
    {kind:'observatie',eventDate:'2026-11-03',score:3},
    {kind:'observatie',eventDate:'2026-08-01',score:0},
    {kind:'notitie',eventDate:'2026-09-01',score:0},
    {kind:'sanctie_schriftelijk',eventDate:'2026-10-01',score:0}
  ],options);
  assert.equal(scores.count,2);
  assert.equal(scores.average,6.5);
  assert.equal(scores.trend,'down');
  const empty=observationAverage([],options);
  assert.equal(empty.count,0);
  assert.equal(empty.average,null);
  assert.equal(empty.trend,'insufficient');
});

test('Burger role labels are fixed, citizen-scoped and never taken from other services',()=>{
 assert.deepEqual(CITIZEN_DOSSIER_ROLE_LABELS,{bio:'Burger in opleiding',burger:'Volwaardige Burger'});
 assert.equal(citizenDossierRole({savedRole:'bio',verifiedRole:'Burger'}),'bio');
 assert.equal(citizenDossierRole({savedRole:'burger',verifiedRole:'BIO'}),'burger');
 assert.equal(citizenDossierRole({verifiedRole:'Burgerraad'}),'burger');
 assert.equal(citizenDossierRole({verifiedRole:'BIO'}),'bio');
 assert.equal(citizenDossierRole({rosterRank:'Burger IO'}),'bio');
 assert.equal(citizenDossierRole({rosterRank:'Volwaardige Burger'}),'burger');
 assert.equal(citizenDossierRole({rosterRank:'Ambulancier'}),null);
 assert.equal(citizenDossierRole({rosterRank:'Inspecteur'}),null);
 assert.equal(citizenDossierRole({rosterRank:'Arts'}),null);
});

test('Burgerraad/Korpsleiding/technical profile input is exact, validated and revisioned',()=>{
 const valid={role:'burger',volwaardigSince:'2026-11-19',
  reason:'Volwaardig na positieve evaluatie',expectedRevision:0};
 assert.deepEqual(validateCitizenProfile(valid,{today:'2026-11-20'}),valid);
 assert.deepEqual(validateCitizenProfile({...valid,role:'bio',volwaardigSince:null},{today:'2026-11-20'}),
   {...valid,role:'bio',volwaardigSince:null});
 for(const invalid of [
  {...valid,role:'Ambulancier'},
  {...valid,role:'Burgerraad'},
  {...valid,volwaardigSince:'2026-11-21'},
  {...valid,volwaardigSince:'2026-02-30'},
  {...valid,role:'bio'},
  {...valid,expectedRevision:-1},
  {...valid,expectedRevision:1.5},
  {...valid,reason:'te kort'},
  {...valid,byDiscordId:'333333333333333333'},
  {...valid,reason:'Wijziging'+String.fromCharCode(0)}
 ])assert.throws(()=>validateCitizenProfile(invalid,{today:'2026-11-20'}));
});

test('Burgerdossier heeft geen verlof/callsign en schrijft profiel uitsluitend met audit',async()=>{
 const fs=await import('node:fs');
 const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const html=read('public/burger-personeelsdossiers.html');
 const routes=read('src/citizen-dossier-routes.js');
 assert.match(html,/id="citizenPicker"/);
 assert.match(html,/id="citizenColleague"/);
 assert.match(html,/id="profileRole"/);
 assert.match(html,/id="profileSince"/);
 assert.match(html,/id="citizenProfileForm"/);
 assert.doesNotMatch(html,/id="citizenLeave"/);
 assert.doesNotMatch(html,/id="personCall"/);
 assert.doesNotMatch(html,/id="leave"/);
 assert.match(routes,/app\.post\('\/api\/citizen-staff\/:discordId\/profile'/);
 assert.match(routes,/canWriteCitizenDossier\(req\.bpd,req\.citizenCouncilVerified,person\.personId\)/);
 assert.match(routes,/expectedRevision!==previousRevision/);
 assert.match(routes,/action:'update-citizen-profile'/);
 assert.match(routes,/tx\.create\(audit,/);
 assert.doesNotMatch(routes,/collection\('bpd_leave_requests'\)/);
 assert.doesNotMatch(routes,/discordRolesChanged:true/);
});
