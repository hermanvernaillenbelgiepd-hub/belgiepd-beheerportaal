import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedPoliceRank} from '../src/portal-profile-mode.js';
import {verifiedOfficerCadre,verifiedCorpsSelfDossier,VERIFIED_CORPS_SESSION_MS}
 from '../src/verified-police-cadre.js';
import {verifyBoardDiscordRole} from '../src/dossier-grants.js';
import {deriveServiceDossierDepartments,verifiedServiceReportRoles}
 from '../src/service-dossier-access.js';
import fs from 'node:fs';

const G='123456789012345678',ID='987654321098765432',now=Date.now();
const P='1309532438053130326',C='1562710901080068229',B='1309532438082355251';
const O='1473474238664020151',A='1309532438053130325';
const member=(roles,age)=>({guildId:G,verifiedAt:now-age,roleIds:roles});
const actor=(extra={})=>({uid:'discord:'+ID,discordId:ID,role:'korpsleiding',
  departments:['politie'],departmentRoles:{politie:'korpsleiding'},...extra});
test('corps-specific workday is finite and independent from seven-day login',()=>{
 assert.equal(VERIFIED_CORPS_SESSION_MS,8*60*60*1000);
 const roles=member([P,C],2*60*60*1000);
 assert.equal(verifiedPoliceRank(roles,G,now),'korpsleiding');
 assert.equal(verifiedPoliceRank(member([P,C],VERIFIED_CORPS_SESSION_MS+1),G,now),null);
 assert.equal(verifiedPoliceRank(member([P,O],16*60*1000),G,now),null);
 assert.equal(verifiedPoliceRank(member([P,O],14*60*1000),G,now),'officierenkader');
});
test('a fake callsign, foreign guild or invalid ID never extends corps proof',()=>{
 assert.equal(verifiedPoliceRank({...member([P,C],1000),guildId:'111111111111111111'},G,now),null);
 assert.equal(verifiedPoliceRank(member([P,'FAKE'],1000),G,now),null);
 assert.equal(verifiedPoliceRank(member([P],30*60*1000),G,now),null);
});
test('only same-ID approved Corps may read own 9xx using workday proof',()=>{
 const old=member([P,C],3*60*60*1000);
 assert.equal(verifiedOfficerCadre(old,G,now,15*60*1000),null);
 assert.equal(verifiedCorpsSelfDossier(actor(),ID,old,G,now),true);
 assert.equal(verifiedCorpsSelfDossier(actor(),'777777777777777777',old,G,now),false);
 assert.equal(verifiedCorpsSelfDossier(actor({role:'officierenkader'}),ID,old,G,now),false);
 assert.equal(verifiedCorpsSelfDossier(actor({departmentRoles:{politie:'basiskader'}}),ID,old,G,now),false);
 assert.equal(verifiedCorpsSelfDossier(actor(),ID,member([P,O],1000),G,now),false);
 assert.equal(verifiedCorpsSelfDossier(actor(),ID,member([P,C],VERIFIED_CORPS_SESSION_MS+1),G,now),false);
});
test('only dual-verified Board plus Corps has extended Board-proof window',()=>{
 assert.equal(verifyBoardDiscordRole(member([B,P,C],3*60*60*1000),G,now),true);
 assert.equal(verifyBoardDiscordRole(member([B],16*60*1000),G,now),false);
 assert.equal(verifyBoardDiscordRole(member([B,P,O],16*60*1000),G,now),false);
 assert.equal(verifyBoardDiscordRole(member([B,P,C],VERIFIED_CORPS_SESSION_MS+1),G,now),false);
});
test('stale non-Board service permissions never leak from extended Board role',()=>{
 const roles=member([B,P,C,A],3*60*60*1000);
 const own=[{dept:'ambulance',personId:ID,rank:'AMB',call:'AMB'}];
 const x=actor({departments:['politie','ambulance']});
 const all=deriveServiceDossierDepartments(x,own,roles,null,G,now);
 assert.deepEqual(all,['politie','ambulance','brandweer','depannage']);
 const report=verifiedServiceReportRoles(x,roles,G,now);
 assert.equal(report.ambulanceAzls,false);
});
test('no stale Board or arbitrary role may open foreign service dossiers',()=>{
 const old=member([P,C],3*60*60*1000);
 assert.deepEqual(deriveServiceDossierDepartments(actor(),[],old,null,G,now),['politie']);
 const foreign=member([B,P,O],3*60*60*1000);
 assert.deepEqual(deriveServiceDossierDepartments(actor(),[],foreign,null,G,now),['politie']);
});
test('the protected 9xx route keeps short freshness for all other subjects',()=>{
 const source=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(source,/verifiedCorpsSelfDossier\(req\.bpd,\s*subjectId/);
 assert.match(source,/verifiedCorpsSelfDossier\(req\.bpd,\s*discordId/);
 assert.match(source,/verifiedOfficerCadre\(found\[j\]\.data\(\),process\.env\.DISCORD_GUILD_ID,\s*Date\.now\(\),15\*60\*1000\)/);
});
