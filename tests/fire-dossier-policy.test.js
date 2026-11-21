import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRE_ROLES,FIRE_COURSES,verifiedFireRoles,fireSubjectClass,fireActorClass,
  mayOpenFireSubject,fireRecordVisibility,fireMayCreate,fireSanctionLevel,fireCanWithdrawSanction}
  from '../src/fire-dossier-policy.js';
const guild='1309532437952466984',now=Date.UTC(2026,9,25);
const member=ids=>verifiedFireRoles({guildId:guild,verifiedAt:now-1000,roleIds:ids},guild,now);
const subject={dept:'brandweer',personId:'111111111111111111',rank:'Brandweerman',call:'BW-11'};
const basic=member([FIRE_ROLES.member]),middle=member([FIRE_ROLES.member,FIRE_ROLES.middle]);
const leadership=member([FIRE_ROLES.member,FIRE_ROLES.leadership]);
test('Brandweer Discord role evidence must be fresh and guild-bound',()=>{
 assert.equal(verifiedFireRoles({guildId:guild,verifiedAt:now-16*60000,roleIds:[FIRE_ROLES.member]},guild,now),null);
 assert.equal(verifiedFireRoles({guildId:'222222222222222222',verifiedAt:now,roleIds:[FIRE_ROLES.member]},guild,now),null);
 assert.equal(fireSubjectClass(subject,basic),'member');
 assert.equal(fireSubjectClass(subject,middle),'middle');
 assert.equal(fireSubjectClass(subject,leadership),'leadership');
 assert.equal(fireSubjectClass({...subject,call:'OOFF-08'},basic),'middle');
 assert.equal(fireSubjectClass({...subject,call:'OOFF-15'},basic),'middle');
 assert.equal(fireSubjectClass({...subject,call:'ZONE'},basic),'leadership');
});
test('Middenkader sees lower staff identity only, not confidential registrations',()=>{
 const actor={departments:['brandweer'],fireAccessLevel:'middle'};
 assert.equal(mayOpenFireSubject(actor,subject,basic),true);
 assert.equal(mayOpenFireSubject(actor,subject,middle),false);
 assert.equal(mayOpenFireSubject(actor,subject,leadership),false);
 assert.equal(fireRecordVisibility(actor,subject,basic),'identity');
 assert.equal(fireMayCreate(actor,subject,basic,'observatie'),true);
 assert.equal(fireMayCreate(actor,subject,basic,'notitie'),true);
 assert.equal(fireMayCreate(actor,subject,basic,'sanctie'),false);
});
test('Brandweerleiding can register observations notes and sanctions for ordinary staff',()=>{
 const actor={departments:['brandweer'],fireAccessLevel:'leadership'};
 for(const type of ['observatie','notitie','sanctie'])
   assert.equal(fireMayCreate(actor,subject,basic,type),true);
 assert.equal(mayOpenFireSubject(actor,subject,middle),true);
 assert.equal(mayOpenFireSubject(actor,subject,leadership),true);
});
test('ZONE can see higher staff, Bestuur reads without operational write powers',()=>{
 const zone={departments:['brandweer'],fireZoneChief:true,fireAccessLevel:'zone'};
 const board={boardPersonnelAdmin:true,departments:['brandweer']};
 assert.equal(mayOpenFireSubject(zone,subject,middle),true);
 assert.equal(fireRecordVisibility(zone,subject,leadership),'full');
 assert.equal(fireMayCreate(zone,subject,middle,'sanctie'),true);
 assert.equal(mayOpenFireSubject(board,subject,middle),true);
 assert.equal(fireMayCreate(board,subject,basic,'observatie'),false);
});
test('Fire leadership mirrors Police Middenkader registrations and ZONE mirrors Corps',()=>{
 const mid={departments:['brandweer'],fireAccessLevel:'middle'};
 const leader={departments:['brandweer'],fireAccessLevel:'leadership'};
 const zone={departments:['brandweer'],fireAccessLevel:'zone',fireZoneChief:true};
 for(const type of ['basisnotitie','notitie','observatie','sanctie']){
   assert.equal(fireMayCreate(mid,subject,basic,type),type!=='sanctie');
   assert.equal(fireMayCreate(leader,subject,basic,type),true);
   assert.equal(fireMayCreate(zone,subject,middle,type),true);
 }
 assert.equal(fireSanctionLevel(leader),'korpsleiding');
 assert.equal(fireSanctionLevel(zone),'korpsleiding');
 assert.equal(fireSanctionLevel(mid),null);
 assert.equal(fireMayCreate(leader,subject,middle,'notitie'),true);
 assert.equal(fireMayCreate(leader,subject,leadership,'sanctie'),true);
 const readOnlyBoard={boardPersonnelAdmin:true,departments:['brandweer']};
 assert.equal(fireMayCreate(readOnlyBoard,subject,basic,'basisnotitie'),false);
});
test('Only ZONE or signed technical mode can withdraw Fire sanctions',()=>{
 const mid={departments:['brandweer'],fireAccessLevel:'middle'};
 const leader={departments:['brandweer'],fireAccessLevel:'leadership'};
 const zone={departments:['brandweer'],fireZoneChief:true,
   fireAccessLevel:'zone',discordId:'333333333333333333'};
 assert.equal(fireCanWithdrawSanction(mid,subject,basic),false);
 assert.equal(fireCanWithdrawSanction(leader,subject,basic),true);
 assert.equal(fireCanWithdrawSanction(zone,subject,middle),true);
 assert.equal(fireCanWithdrawSanction(zone,{...subject,personId:zone.discordId},middle),false);
 assert.equal(fireCanWithdrawSanction(
   {departments:['brandweer'],portalTechnicalMode:true,profileTechnicalAvailable:false},
   subject,basic),false);
});
test('Handmatige Brandweer-Middenkaderherstel blijft dienstgebonden',()=>{
 const manual={departments:['brandweer'],manualFireRole:'middle'};
 assert.equal(fireActorClass(manual,null),'middle');
 assert.equal(fireActorClass({...manual,departments:['politie']},null),'none');
});
test('All eight training categories are available without creating new Discord roles',()=>{
 assert.equal(FIRE_COURSES.length,8);
 for(const name of ['RED-TEAM','Gevaarlijke stoffen','Basistraining'])
   assert.equal(FIRE_COURSES.find(course=>course.name===name)?.roleId,null);
});

test('Officiële basis- en stagefuncties blijven zichtbaar als doelrolcache verloopt',()=>{
  const staff={dept:'brandweer',personId:'222222222222222222',call:'BWM-11',rank:'Brandweerman'};
  const trainee={...staff,call:'STAG-04',rank:'Stagiair'};
  const middle={...staff,call:'OOFF-12',rank:'Sergeant'};
  const higher={...staff,call:'OFF-04',rank:'Kapitein'};
  assert.equal(fireSubjectClass(staff,null),'member');
  assert.equal(fireSubjectClass(trainee,null),'trainee');
  assert.equal(fireSubjectClass(middle,null),'middle');
  assert.equal(fireSubjectClass(higher,null),'leadership');
  const actor={departments:['brandweer'],fireAccessLevel:'middle'};
  assert.equal(mayOpenFireSubject(actor,staff,null),true);
  assert.equal(mayOpenFireSubject(actor,trainee,null),true);
  assert.equal(mayOpenFireSubject(actor,middle,null),false);
  assert.equal(mayOpenFireSubject(actor,higher,null),false);
  const lead={departments:['brandweer'],fireAccessLevel:'leadership'};
  assert.equal(mayOpenFireSubject(lead,middle,null),true);
  assert.equal(mayOpenFireSubject(lead,higher,null),true);
  assert.equal(mayOpenFireSubject({departments:['brandweer'],fireAccessLevel:'none'},staff,null),false);
  for(const type of ['observatie','notitie','basisnotitie','promotievoorstel'])
    assert.equal(fireMayCreate(actor,staff,null,type),true);
  for(const type of ['sanctie','personeelsbeweging'])
    assert.equal(fireMayCreate(actor,staff,null,type),false);
});
