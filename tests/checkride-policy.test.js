import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKRIDE_TRACKS,verifiedCheckrideRoles,permittedCheckrideTracks,
 eligibleCheckrideSubject,checkrideInput,checkrideAccessNotice,CHECKRIDE_ROLE_MAX_AGE_MS} from '../src/checkride-policy.js';

const GUILD='123456789012345678';
const M='987654321098765432';
const S='987654321098765433';
const now=Date.now();
const profile=(dept,discordId=M)=>({personId:discordId,dept,call:'123',rank:'STAG',status:'STAGE'});
const member=(...roleIds)=>({guildId:GUILD,verifiedAt:now-1000,roleIds});
const actor=(dept)=>({uid:'discord:'+M,discordId:M,departments:[dept],role:'basiskader',departmentRoles:{[dept]:'basiskader'}});
const roster=dept=>[profile(dept)];
const data={track:'k9',subjectDiscordId:S,eventDate:'2026-11-06',kind:'vervolg',
 outcome:'voldoende',scores:{kennis:4,praktijk:4,communicatie:4,veiligheid:4,zelfstandigheid:4},
 notes:'Procedures goed toegepast'};
test('six independent training scopes exist',()=>assert.deepEqual(Object.keys(CHECKRIDE_TRACKS),
 ['motard','k9','rago','ambulance_stage','brandweer_stage','burger_io']));
test('K9 instructor does not inherit MOTARD or RAGO',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('politie'),member('1345302115689431061'),
 roster('politie'),GUILD,now),['k9']);
});
test('separate police instructor roles stack without other departments',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('politie'),
 member('1345302115689431061','1359656762289946755'),
 roster('politie'),GUILD,now),['motard','k9']);
});
test('unapproved department scope cannot leak from verified role',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('brandweer'),
 member('1345302115689431061'),roster('brandweer'),GUILD,now),[]);
});
test('same Discord ID needs one unique own service record',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('politie'),member('1345302115689431061'),
 [profile('politie'),profile('politie')],GUILD,now),[]);
});
test('citizen council sees BIO only inside citizen scope',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('burger'),member('1492485336197234728'),
 roster('burger'),GUILD,now),['burger_io']);
});
test('AMB and BW teaching roles stay separate',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('ambulance'),member('1309532437952466988'),
 roster('ambulance'),GUILD,now),['ambulance_stage']);
 assert.deepEqual(permittedCheckrideTracks(actor('brandweer'),member('1309532437952466989'),
 roster('brandweer'),GUILD,now),['brandweer_stage']);
});
test('instructor role proof stays valid during the ordinary training day',()=>{
 assert.equal(CHECKRIDE_ROLE_MAX_AGE_MS,24*60*60*1000);
 assert.deepEqual(permittedCheckrideTracks(actor('politie'),
  {...member('1345302115689431061'),verifiedAt:now-4*60*60*1000},
  roster('politie'),GUILD,now),['k9']);
});
test('expired role proofs never authorize instructors',()=>{
 assert.equal(verifiedCheckrideRoles({guildId:GUILD,verifiedAt:now-25*60*60*1000,roleIds:['1345302115689431061']},GUILD,now),null);
});
test('wrong guild and invalid role IDs fail closed',()=>{
 assert.equal(verifiedCheckrideRoles(member('x'),GUILD,now),null);
 assert.equal(verifiedCheckrideRoles(member('1345302115689431061'),'999999999999999999',now),null);
});
test('qualified K9 subject cannot be treated as RAGO',()=>{
 const p=profile('politie',S);
 assert.equal(eligibleCheckrideSubject('k9',p,member('1309532438053130326','1345297414612979713'),GUILD,now),true);
 assert.equal(eligibleCheckrideSubject('rago',p,member('1309532438053130326','1345297414612979713'),GUILD,now),false);
});
test('full Citizen role supersedes BIO training role',()=>{
 assert.equal(eligibleCheckrideSubject('burger_io',profile('burger',S),
 member('1398985105254650007','1309532438019706966'),GUILD,now),false);
});
test('ambulance stage requires actual stage rank and membership',()=>{
 const p=profile('ambulance',S);
 assert.equal(eligibleCheckrideSubject('ambulance_stage',p,member('1309532438053130323'),GUILD,now),true);
 assert.equal(eligibleCheckrideSubject('ambulance_stage',{...p,rank:'AMB',status:'ACTIEF'},member('1309532438053130323'),GUILD,now),false);
});
test('input validation rejects extra keys and invalid scores',()=>{
 assert.throws(()=>checkrideInput({...data,department:'politie'},now));
 assert.throws(()=>checkrideInput({...data,scores:{...data.scores,kennis:0}},now));
 assert.throws(()=>checkrideInput({...data,outcome:'burgerraad'},now));
});
test('valid input is pinned to the correct track and department',()=>{
 const result=checkrideInput(data,now);
 assert.equal(result.department,'politie');assert.equal(result.average,4);
 assert.equal(result.subjectDiscordId,S);
 assert.equal('evaluatorDiscordId' in result,false);
});

test('Burgerraad can oversee BIO with independent council role and citizen roster',()=>{
 const policePortal={...actor('politie'),departments:['politie']};
 assert.deepEqual(permittedCheckrideTracks(policePortal,member('1492485336197234728'),
  [profile('politie'),profile('burger')],GUILD,now),['burger_io']);
});
test('unverified council role cannot open civilian assessments',()=>{
 assert.deepEqual(permittedCheckrideTracks(actor('politie'),member('1345302115689431061'),
  [profile('politie'),profile('burger')],GUILD,now),['k9']);
});
test('protected 9xx police dossiers are not ordinary checkride trainees',()=>{
 assert.equal(eligibleCheckrideSubject('k9',{...profile('politie',S),call:'900'},
  member('1309532438053130326','1345297414612979713'),GUILD,now),false);
});

test('no access gives an actionable role-refresh explanation',()=>{
 const message=checkrideAccessNotice(actor('politie'),
  {...member('1345302115689431061'),verifiedAt:now-25*60*60*1000},
  roster('politie'),GUILD,now);
 assert.match(message,/Discordrollen vernieuwen/);
});
test('missing own service record gives a linkage explanation',()=>{
 const message=checkrideAccessNotice(actor('politie'),member('1345302115689431061'),
  [profile('brandweer')],GUILD,now);
 assert.match(message,/dienstmachtiging/);
});
test('portal authorization and own staff record stay mandatory after freshness fix',()=>{
 assert.deepEqual(permittedCheckrideTracks({...actor('politie'),departments:['brandweer']},
  member('1345302115689431061'),roster('politie'),GUILD,now),[]);
 assert.deepEqual(permittedCheckrideTracks(actor('politie'),
  member('1345302115689431061'),[],GUILD,now),[]);
});
