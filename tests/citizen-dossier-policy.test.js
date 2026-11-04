import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITIZEN_ROLES,verifiedCitizenCouncil,canAccessCitizenDossier,
  canWriteCitizenDossier,citizenMemberType,citizenSubject,
  validateCitizenEntry,observationAverage
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
test('Police Korpsleiding may read Burger dossiers only with independently verified service authority',()=>{
  const corps={...actor,role:'korpsleiding',departments:['politie'],
    departmentRoles:{politie:'korpsleiding'},discordPoliceRank:'korpsleiding'};
  assert.equal(canAccessCitizenDossier(corps,false),true);
  assert.equal(canWriteCitizenDossier(corps,false,'323456789012345678'),false);
  assert.equal(canAccessCitizenDossier({...corps,discordPoliceRank:null},false),false);
  assert.equal(canAccessCitizenDossier({...corps,departmentRoles:{politie:'basiskader'}},false),false);
  assert.equal(canAccessCitizenDossier({...corps,departments:['brandweer']},false),false);
  assert.equal(canAccessCitizenDossier({...corps,role:'officierenkader'},false),false);
  assert.equal(canAccessCitizenDossier({...corps,uid:'discord:999999999999999999'},false),false);
  assert.equal(canAccessCitizenDossier({...corps,uid:'google:account'},false),false);
  assert.equal(canAccessCitizenDossier({...corps,discordPoliceRank:null,manualCorpsApproved:true},false),true);
  assert.equal(canWriteCitizenDossier({...corps,discordPoliceRank:null,manualCorpsApproved:true},
    false,'323456789012345678'),false);
  // Een goedgekeurd historisch account met precies één politiedienst mag
  // de bestaande serverrolfallback gebruiken, mits Discord-rang bevestigd is.
  assert.equal(canAccessCitizenDossier({...actor,role:'korpsleiding',departments:['politie'],
    discordPoliceRank:'korpsleiding'},false),true);
  // Met meerdere diensten of een ontbrekende politie-rolscope mag dat nooit.
  assert.equal(canAccessCitizenDossier({...corps,departments:['politie','brandweer'],
    departmentRoles:{brandweer:'korpsleiding'}},false),false);
  assert.equal(canAccessCitizenDossier({...actor,boardPersonnelAdmin:true},false),false);
});

test('Burgerraad and verified technical beheer retain write access, not own-dossier writes',()=>{
  const subject='323456789012345678';
  const technical={...actor,portalTechnicalMode:true,profileTechnicalAvailable:true};
  assert.equal(canAccessCitizenDossier(technical,false),true);
  assert.equal(canWriteCitizenDossier(technical,false,subject),true);
  assert.equal(canWriteCitizenDossier(technical,false,id),false);
  assert.equal(canWriteCitizenDossier(actor,true,subject),true);
  assert.equal(canWriteCitizenDossier(actor,true,id),false);
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
test('observation score average excludes all notes and sanctions',()=>{
  assert.deepEqual(observationAverage([{kind:'observatie',score:10},{kind:'observatie',score:3},
    {kind:'notitie',score:0},{kind:'sanctie_schriftelijk',score:0}]),
    {count:2,average:6.5});
  assert.deepEqual(observationAverage([]),{count:0,average:null});
});
