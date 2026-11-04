import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BURGER_ROLE_IDS} from '../src/burger-organogram-projection.js';
import {isVerifiedCitizenCouncil,citizenStage,verifiedCitizenStage,
 validateCitizenEntry,validateCitizenLeave,citizenReport} from '../src/citizen-dossier-policy.js';

const guild='123456789012345678',id='223456789012345678',now=1800000000000;
const decoded={uid:'discord:'+id,bpdDiscord:true,bpdGuildId:guild,
 firebase:{sign_in_provider:'custom'}};
const member={guildId:guild,verifiedAt:now-30000,roleIds:[BURGER_ROLE_IDS.council]};
const base={type:'notitie',title:'Opvolging BIO',details:'Reguliere opvolging van burger.',date:'2026-11-04'};
test('Only signed, verified Burgerraad role opens citizen records',()=>{
 assert.equal(isVerifiedCitizenCouncil(decoded,member,guild,id,now),true);
 assert.equal(isVerifiedCitizenCouncil(decoded,{...member,roleIds:[BURGER_ROLE_IDS.member]},guild,id,now),false);
 assert.equal(isVerifiedCitizenCouncil(decoded,{...member,verifiedAt:now-16*60000},guild,id,now),false);
 assert.equal(isVerifiedCitizenCouncil({...decoded,uid:'discord:333333333333333333'},member,guild,id,now),false);
 assert.equal(isVerifiedCitizenCouncil({...decoded,firebase:{sign_in_provider:'google.com'}},member,guild,id,now),false);
 assert.equal(isVerifiedCitizenCouncil(decoded,{...member,guildId:'333333333333333333'},guild,id,now),false);
 assert.equal(isVerifiedCitizenCouncil(decoded,{...member,roleIds:[BURGER_ROLE_IDS.council,'not-id']},guild,id,now),false);
});
test('Citizen rank reflects verified roles, not client-controlled name or sheet stage',()=>{
 assert.equal(citizenStage([BURGER_ROLE_IDS.trainee]),'BIO');
 assert.equal(citizenStage([BURGER_ROLE_IDS.trainee,BURGER_ROLE_IDS.member]),'Burger');
 assert.equal(citizenStage([BURGER_ROLE_IDS.council]),'Burgerraad');
 assert.equal(citizenStage(['333333333333333333']),null);
 const api={status:'ok',entries:new Map([[id,[BURGER_ROLE_IDS.member]]])};
 assert.equal(verifiedCitizenStage(id,api,null,guild,now),'Burger');
 assert.equal(verifiedCitizenStage(id,{status:'ok',entries:new Map()},member,guild,now),null);
 assert.equal(verifiedCitizenStage(id,{status:'unavailable'},member,guild,now),'Burgerraad');
 assert.equal(verifiedCitizenStage(id,{status:'unavailable'},
   {...member,verifiedAt:now-8*86400000},guild,now),null);
});
test('Notities and observaties remain separate, with optional 0-10 score',()=>{
 const note=validateCitizenEntry(base,'BIO');
 assert.equal(note.type,'notitie');assert.equal(note.score,null);
 const observation=validateCitizenEntry({...base,type:'observatie',score:8},'BIO');
 assert.equal(observation.score,8);
 assert.throws(()=>validateCitizenEntry({...base,type:'notitie',score:8},'BIO'));
 assert.throws(()=>validateCitizenEntry({...base,type:'observatie',score:11},'BIO'));
 assert.throws(()=>validateCitizenEntry({...base,details:'<script>fout</script>'},'BIO'));
});
test('Sancties zijn uitsluitend mondeling of schriftelijk',()=>{
 for(const sanctionType of ['mondeling','schriftelijk']){
  const record=validateCitizenEntry({...base,type:'sanctie',sanctionType},'Burger');
  assert.equal(record.sanctionType,sanctionType);
 }
 assert.throws(()=>validateCitizenEntry({...base,type:'sanctie',sanctionType:'ontslag'},'Burger'));
});
test('BIO promotion only when current verified role is volwaardige Burger',()=>{
 const args={type:'volwaardig',date:'2026-11-04',details:'Aangenomen na voltooiing van de opleiding'};
 assert.throws(()=>validateCitizenEntry(args,'BIO'));
 const promoted=validateCitizenEntry(args,'Burger');
 assert.equal(promoted.type,'volwaardig');
 assert.equal(promoted.title,'Overgang naar volwaardige Burger');
 assert.throws(()=>validateCitizenEntry({...args,date:'2026-11-31'},'Burger'));
});
test('Burgerverlof dates are validated without a weekly report workflow',()=>{
 assert.deepEqual(validateCitizenLeave({startDate:'2026-11-05',endDate:'2026-11-07',note:'Vrijgesteld'}),
  {startDate:'2026-11-05',endDate:'2026-11-07',days:3,note:'Vrijgesteld'});
 assert.throws(()=>validateCitizenLeave({startDate:'2026-11-07',endDate:'2026-11-05'}));
 assert.throws(()=>validateCitizenLeave({startDate:'2026-11-30',endDate:'2026-12-01',note:'<x>'}));
});
test('Only a per-person report is produced; no Burgerweekrapport',()=>{
 const report=citizenReport([
  {type:'notitie'},{type:'observatie',score:8},{type:'observatie',score:6},
  {type:'sanctie'},{type:'volwaardig'}
 ],[{id:'one'}]);
 assert.equal(report.counts.notitie,1);
 assert.equal(report.counts.observatie,2);
 assert.equal(report.counts.sanctie,1);
 assert.equal(report.counts.volwaardig,1);
 assert.equal(report.counts.verlof,1);
 assert.equal(report.observationAverage,7);
});
test('Citizen API is isolated from retired generic citizen endpoint',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const routes=readFileSync(new URL('../src/citizen-dossier-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/burgerdossiers.html',import.meta.url),'utf8');
 assert.match(server,/installCitizenDossierRoutes\(app,\{getSnapshot\}\)/);
 assert.match(server,/app\.use\('\/api\/citizens',/);
 assert.match(routes,/BPD_ENABLE_CITIZEN_DOSSIERS/);
 assert.match(routes,/councilOnly/);
 assert.doesNotMatch(routes,/collection\('bpd_notices'\)/);
 assert.match(html,/Persoonsrapport afdrukken/);
});
