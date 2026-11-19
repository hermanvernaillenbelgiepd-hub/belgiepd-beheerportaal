import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canChangePoliceGrade,allowedPoliceGradeChoices,
  validatePoliceGradeChange,classifyPoliceGradeChange,policeCallGrade,
  verifiedPoliceRankAuthority,policeOfficialRankLabel} from '../src/personnel-rank-policy.js';
import {mergePersonnelEdits} from '../src/personnel-editor-policy.js';
import {verifiedPoliceRank} from '../src/portal-profile-mode.js';
import {verifyGuildAuthorizationRoles} from '../src/discord-guild-authorization.js';
import {staffActivityEvent} from '../src/personnel-activity.js';
import {SPECIALTY_LABELS} from '../src/normalize.js';
import {roleSummary} from '../src/role-catalog.js';

const actorId='111111111111111111',subjectId='222222222222222222';
const officer={uid:'discord:'+actorId,discordId:actorId,role:'officierenkader',
  discordPoliceRank:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},dossierAllowedDepartments:['politie'],
  dossierNativeDepartments:['politie'],boardPersonnelAdmin:false,
  portalTechnicalMode:false};
const corps={...officer,role:'korpsleiding',discordPoliceRank:'korpsleiding',
  departmentRoles:{politie:'korpsleiding'}};
const target=(call='438',rank='Inspecteur')=>({
  dept:'politie',personId:subjectId,call,rank,name:'Testlid',status:'Actief'});

test('Officierenkader changes lower police grades, not own or officers',()=>{
 assert.equal(canChangePoliceGrade(officer,target()),true);
 assert.equal(canChangePoliceGrade(officer,target('730','Hoofdinspecteur')),true);
 assert.equal(canChangePoliceGrade(officer,target('920','Aspirant Commissaris')),false);
 assert.equal(canChangePoliceGrade(officer,{...target(),personId:actorId}),false);
 assert.equal(canChangePoliceGrade({...officer,discordPoliceRank:null},target()),false);
 assert.equal(canChangePoliceGrade({...officer,dossierNativeDepartments:[]},target()),false);
 assert.equal(canChangePoliceGrade({...officer,role:'middenkader',
   departmentRoles:{politie:'middenkader'}},target()),false);
 assert.equal(allowedPoliceGradeChoices(officer).includes('Aspirant Commissaris'),false);
});
test('Korpsleiding can change officer rank, never protected 900/910',()=>{
 assert.equal(canChangePoliceGrade(corps,target('930','Aspirant Commissaris')),true);
 assert.equal(canChangePoliceGrade(corps,target('900','Eerste Hoofdcommissaris')),false);
 assert.equal(canChangePoliceGrade(corps,target('910','Eerste Commissaris')),false);
 assert.equal(allowedPoliceGradeChoices(corps).includes('Aspirant Commissaris'),true);
});
test('Callsign must match exact destination rank and be outside protected corps numbering',()=>{
 const body={expectedRank:'Inspecteur',newRank:'Aspirant Inspecteur',
   newCall:'328',reason:'Onderbouwde beslissing wegens langdurige bijsturing.',
   expectedRevision:0};
 assert.equal(validatePoliceGradeChange(body).newCall,'328');
 assert.throws(()=>validatePoliceGradeChange({...body,newCall:'438'}),/roepnummer/);
 assert.throws(()=>validatePoliceGradeChange({...body,newRank:'Aspirant Commissaris',newCall:'900'}),/roepnummer/);
 assert.throws(()=>validatePoliceGradeChange({...body,newRank:'Inspecteur'}),/andere/);
 assert.throws(()=>validatePoliceGradeChange({...body,reason:'te kort'}),/Motivering/);
 assert.throws(()=>validatePoliceGradeChange({...body,expectedRevision:NaN}),/Vernieuw/);
 assert.equal(policeCallGrade('501'),3);
 assert.equal(policeCallGrade('930'),7);
 assert.equal(policeCallGrade('900'),null);
 assert.equal(classifyPoliceGradeChange('501','428'),'demotion');
 assert.equal(classifyPoliceGradeChange('428','730'),'promotion');
 assert.equal(classifyPoliceGradeChange('425','428'),'rank_changed');
});
test('Only approved rank overlays can change displayed grade; preserve origin otherwise',()=>{
 const src=[target()];
 const manual={dept:'politie',discordId:subjectId,revision:1,
   name:'Testlid',call:'328',status:'Actief',rank:'Aspirant Inspecteur'};
 assert.equal(mergePersonnelEdits(src,[manual])[0].rank,'Inspecteur');
 assert.equal(mergePersonnelEdits(src,[{...manual,approvedRankEdit:true}])[0].rank,
  'Aspirant Inspecteur');
 assert.equal(mergePersonnelEdits(src,[{...manual,status:'GESCHORST',approvedRankEdit:true}])[0].rank,
  'Aspirant Inspecteur');
});
test('Promotions and demotions appear in the recent staff activity history',()=>{
 const data={dept:'politie',discordId:subjectId,name:'Testlid',
   before:'Inspecteur',after:'Aspirant Inspecteur',
   at:new Date('2026-10-25T17:00:00Z')};
 assert.equal(staffActivityEvent('d1',{...data,type:'demotion'}).type,'demotion');
 assert.equal(staffActivityEvent('d2',{...data,type:'rank_changed'}).type,'rank_changed');
});
test('LRD Discord role exists but is not a default police specialty',()=>{
 assert.equal(SPECIALTY_LABELS.politie.includes('LRD (Recherche)'),false);
 const roles=roleSummary(['1380843428354592780']);
 assert.ok(roles.roles.some(r=>r.name==='LRD (Lokale Recherche)'));
 assert.equal(roles.policeRank,null);
});
test('New rank workflow includes server checks and visible history integration',()=>{
 const routes=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(routes,/\/rank-change'/);
 assert.match(routes,/canChangePoliceGrade\(req\.bpd,subject\)/);
 assert.match(routes,/classifyPoliceGradeChange/);
 assert.match(routes,/PERSONNEL_ACTIVITY_COLLECTION/);
 assert.match(page,/id="rankChangeForm"/);
 assert.match(page,/id="rankChangePanel"/);
 assert.match(page,/demotion:'Degradatie'/);
});

test('Thijs / verified Police Korpsleiding: expired permission is refreshed from guild bot for an effective promotion',async()=>{
 const leader={...corps,discordPoliceRank:null};
 assert.equal(canChangePoliceGrade(leader,target('316','Aspirant Inspecteur')),false,
   'An expired Discord proof must not authorize an actual rank change');
 const guildId='123456789012345678',clock=Date.UTC(2026,10,19,22,30);
 const env={DISCORD_GUILD_ID:guildId,BPD_DISCORD_BOT_TOKEN:'A'.repeat(40)};
 const roles=['1309532438053130326','1562710901080068229'];
 const verified=await verifyGuildAuthorizationRoles(actorId,{
  env,now:()=>clock,cacheResults:false,
  fetchImpl:async()=>({status:200,ok:true,json:async()=>({
   roles,joined_at:'2026-01-01T00:00:00Z',user:{id:actorId}
  })})
 });
 assert.equal(verified.status,'ok');
 const verifiedRole=verifiedPoliceRank({guildId,verifiedAt:clock,roleIds:verified.roleIds},
   guildId,clock);
 assert.equal(verifiedRole,'korpsleiding');
 assert.equal(canChangePoliceGrade({...leader,discordPoliceRank:verifiedRole},
   target('316','Aspirant Inspecteur')),true);
 assert.equal(allowedPoliceGradeChoices({...leader,discordPoliceRank:verifiedRole})
   .includes('Inspecteur'),true);
});
test('Discord bot refresh never grants rank edits without an actual Police Korpsleiding role',async()=>{
 const guildId='123456789012345678',clock=Date.UTC(2026,10,19,22,30);
 const env={DISCORD_GUILD_ID:guildId,BPD_DISCORD_BOT_TOKEN:'A'.repeat(40)};
 const wrongRoles=await verifyGuildAuthorizationRoles(actorId,{
  env,now:()=>clock,cacheResults:false,
  fetchImpl:async()=>({status:200,ok:true,json:async()=>({
   roles:['1309532438053130326','1309532438082355251'],
   joined_at:'2026-01-01T00:00:00Z',user:{id:actorId}
  })})
 });
 assert.equal(wrongRoles.status,'ok');
 const verified=verifiedPoliceRank({guildId,verifiedAt:clock,
  roleIds:wrongRoles.roleIds},guildId,clock);
 assert.equal(verified,null);
 assert.equal(canChangePoliceGrade({...corps,discordPoliceRank:verified},
   target('316','Aspirant Inspecteur')),false);
 const src=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(src,/const personnelRankAction=req\.path==='\/api\/personnel\/overview'/);
 assert.match(src,/verifyGuildAuthorizationRoles\(discordId\)/);
 assert.match(src,/actor\.discordPoliceRank=verifiedPoliceRank\(\{/);
 assert.match(src,/verified\.uid==='discord:'\+discordId/);
 assert.match(src,/const possiblePoliceCadre=/);
 assert.match(src,/if\(personnelRankAction&&verified\.uid==='discord:'\+discordId/);
 assert.match(src,/actor\.discordPoliceRank=verifiedPoliceRank\(\{/);
});

test('Board + highest Police Corps can make verified grade decisions despite a separate administrative role',()=>{
 const leader={...corps,boardPersonnelAdmin:true,dossierSourceFresh:true,
   role:'beheerder',departments:['politie','ambulance'],
   dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie'],
   departmentRoles:{politie:'korpsleiding',ambulance:'basiskader'}};
 assert.equal(verifiedPoliceRankAuthority(leader),'korpsleiding');
 assert.equal(canChangePoliceGrade(leader,target('420','Inspecteur')),true);
 assert.ok(allowedPoliceGradeChoices(leader).includes('Aspirant Commissaris'));
 assert.equal(canChangePoliceGrade({...leader,discordPoliceRank:null},
   target('420','Inspecteur')),false);
 assert.equal(canChangePoliceGrade({...leader,boardPersonnelAdmin:false},
   target('420','Inspecteur')),false);
 assert.equal(canChangePoliceGrade({...leader,dossierSourceFresh:false},
   target('420','Inspecteur')),false);
 assert.equal(canChangePoliceGrade({...leader,departmentRoles:{politie:'middenkader'}},
   target('420','Inspecteur')),false);
 assert.equal(canChangePoliceGrade({...leader,dossierNativeDepartments:[]},
   target('420','Inspecteur')),false);
});
test('Official Inspector name 420 matches 421 in read-only personnel-list display',()=>{
 assert.equal(policeOfficialRankLabel('Inspecteur'),'Inspecteur van Politie (INP)');
 assert.equal(policeOfficialRankLabel('Inspecteur van Politie (INP)'),
   'Inspecteur van Politie (INP)');
 assert.equal(policeOfficialRankLabel('Aspirant Inspecteur'),
   'Aspirant Inspecteur van Politie (A-INP)');
 const member=readFileSync(new URL('../src/member-dashboard-routes.js',import.meta.url),'utf8');
 assert.match(member,/policeOfficialRankLabel\(primary\.rank\)/);
 const editor=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 assert.match(editor,/rankDisplay:p\.dept==='politie'\?policeOfficialRankLabel\(p\.rank\)/);
});
test('Only the original unified personnel-movement form appears for both cadre groups',()=>{
 const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(html,/id="staffMovementMode"/);
 assert.match(html,/id="staffMovementNewCall"/);
 assert.match(html,/<section id="rankChangePanel" hidden style="display:none!important/);
 assert.match(html,/\$\('rankChangePanel'\)\.hidden=true/);
});

test('read-only number previews and real promotions use fresh independently verified guild roles',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/const possiblePoliceCadre=/);
 assert.match(server,/actor\.policeRankVerificationStatus=guild\.status/);
 assert.match(server,/actor\.discordPoliceRank=verifiedPoliceRank/);
 const route=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 assert.match(route,/policeRankVerificationStatus==='bot_unavailable'/);
 assert.match(route,/tx\.get\(fixedReservation\)/);
 assert.match(route,/numberReservation\.exists/);
 const actor={...officer,discordPoliceRank:'officierenkader'};
 const sander=target('485','Inspecteur van Politie (INP)');
 assert.equal(canChangePoliceGrade(actor,sander),true);
 assert.equal(allowedPoliceGradeChoices(actor).includes('Eerste Inspecteur'),true);
 assert.equal(canChangePoliceGrade({...actor,discordPoliceRank:null},sander),false);
 assert.equal(canChangePoliceGrade({...actor,departmentRoles:{politie:'basiskader'}},sander),false);
});
