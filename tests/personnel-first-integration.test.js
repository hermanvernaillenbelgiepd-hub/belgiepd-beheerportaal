import test from 'node:test';
import assert from 'node:assert/strict';
import {staffRoleDisplay} from '../src/staff-role-display.js';
import {mayReadManagement,mayWriteManagement} from '../src/management-utils.js';
import {mayApproveLeave} from '../src/leave-policy.js';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const guild='999999999999999999';
const person='111111111111111111';
const kader='222222222222222222';
const member={guildId:guild,verifiedAt:Date.now()-1000,roleIds:[
  '1309532438053130326','1448043875284287599','1358148694297415741',
  '1309532437977497696']};
const actor={role:'officierenkader',departments:['politie','ambulance'],
  departmentRoles:{politie:'middenkader',ambulance:'officierenkader'},
  discordId:kader};

test('Staff role projection shows verified departmental specializations and series without grants',()=>{
  const result=staffRoleDisplay(member,'politie',guild);
  assert.equal(result.verified,true);
  assert.deepEqual(result.series.map(x=>x.name),['Reeks 1']);
  assert.deepEqual(result.specializations.map(x=>x.name),['Motard']);
  assert.equal(result.specializations.some(x=>x.name==='Verpleegkundige'),false);
  assert.deepEqual(staffRoleDisplay(member,'ambulance',guild).specializations.map(x=>x.name),
    ['Verpleegkundige']);
  assert.deepEqual(Object.keys(result).sort(),['series','specializations','verified']);
  assert.equal(staffRoleDisplay({...member,verifiedAt:Date.now()-1000000},'politie',guild).verified,false);
  assert.equal(staffRoleDisplay({...member,guildId:person},'politie',guild).verified,false);
  assert.equal(staffRoleDisplay({...member,roleIds:['bogus']},'politie',guild).verified,false);
});
test('Kader scope is department-specific and movement rights are reserved for higher ranks',()=>{
  assert.equal(mayReadManagement(actor,'politie'),true);
  assert.equal(mayWriteManagement(actor,'politie','activiteit'),true);
  assert.equal(mayWriteManagement(actor,'politie','notitie'),true);
  assert.equal(mayWriteManagement(actor,'politie','specialisatiebeperking'),true);
  assert.equal(mayWriteManagement(actor,'politie','personeelsbeweging'),false);
  assert.equal(mayWriteManagement(actor,'ambulance','personeelsbeweging'),true);
  assert.equal(mayWriteManagement(actor,'brandweer','activiteit'),false);
  assert.equal(mayWriteManagement({...actor,departmentRoles:{politie:'basiskader',
    ambulance:'officierenkader'}},'politie','notitie'),false);
  assert.equal(mayWriteManagement(actor,'politie','observatie'),false);
});
test('Leave decisions preserve existing rank and maximum duration rules',()=>{
  const input={status:'pending',personDiscordId:person,
    subjectDepartments:['politie'],startDate:'2026-10-20',endDate:'2026-10-21'};
  assert.equal(mayApproveLeave(actor,input,null),true);
  assert.equal(mayApproveLeave({...actor,discordId:person},input,null),false);
  assert.equal(mayApproveLeave({...actor,departments:['ambulance'],
    departmentRoles:{ambulance:'officierenkader'}},input,null),false);
  const long={...input,endDate:'2026-12-15'};
  assert.equal(mayApproveLeave(actor,long,null),false);
  assert.equal(mayApproveLeave({...actor,departmentRoles:{politie:'officierenkader',
    ambulance:'officierenkader'}},long,null),true);
});
test('Existing leave records are reused, with server controlled status and audit',()=>{
  const route=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
  assert.ok(route.includes("app.post('/api/leave/manual',requireUser,requireWrites"));
  assert.ok(route.includes('mayApproveLeave(req.bpd,pending,grant)'));
  assert.ok(route.includes('manual:true'));
  assert.ok(route.includes("status:'approved'"));
  assert.ok(route.includes("ref.collection('audit').doc()"));
  assert.ok(route.includes("process.env.BPD_ENABLE_PERSONNEL_MANUAL_LEAVE!=='true'"));
  assert.ok(route.includes("app.post('/api/leave/requests/:id/decision'"));
});
test('Personnel card supports inline safe action forms and never duplicates formal storage',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match);
  assert.doesNotThrow(()=>new Script(match[1],{filename:'personeelsbeheer.html'}));
  for(const token of [
    'staffManualLeaveForm','staffCaseForm','staffFormalRecords',
    'staffDiscordRoles','staffLeave','staffLinkedTraining',
    '/api/leave/manual','/api/management/cases','/api/registrations/entries',
    '/api/training/'
  ])assert.ok(html.includes(token),token);
  assert.equal(html.includes('staffNoteForm'),false);
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});
test('Public applicant functionality is not mounted and old applicant pages are closed',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.equal(server.includes('installServiceApplicationRoutes(app'),false);
  assert.ok(server.includes("'/solliciteren.html','/sollicitatiebeheer.html'"));
  assert.ok(server.includes('res.status(410)'));
});
