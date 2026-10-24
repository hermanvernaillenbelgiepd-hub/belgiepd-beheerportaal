import test from 'node:test';
import assert from 'node:assert/strict';
import {staffRoleDisplay} from '../src/staff-role-display.js';
import {mayReadManagement,mayWriteManagement} from '../src/management-utils.js';
import {mayApproveLeave} from '../src/leave-policy.js';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {planPersonnelMigration} from '../src/personnel-migration.js';

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


test('Live Sheets personnel sync links verified firefighter IDs and includes other service profiles',()=>{
  const idA='111111111111111111',idB='222222222222222222',
    idC='333333333333333333',idD='444444444444444444',idE='555555555555555555';
  const police=['901','♚','Eerste Hoofdcommissaris','POL_MEMBER','KADER','Actief','Ja','Ja','Nee'];
  police[17]=idA;
  const ambulance=['AMB-01','LEIDING','Ambulancier','AMB_MEMBER','Actief','Ja'];
  ambulance[10]=idB;
  const fire=['ZONE','Hoger kader','Zonecommandant','FIRE_MEMBER','Actief','Docent'];
  // The Fire main tab does NOT contain an ID; BrandweerInfo does.
  const towing=['DEP-01','LEIDING','Depanneur','DEP_MEMBER','Actief','Ja','Nee',idD];
  const citizen=['','Burger','Beroep','CIV_MEMBER','Actief','Ja',idE];
  const personnel={
    politie:[['Callsign','Graad','','Naam'],police],
    ambulance:[['Callsign','Kader','Functie','Naam'],ambulance],
    brandweer:[['Callsign','Kader','Functie','Naam'],fire],
    depannage:[['Callsign','Kader','Functie','Naam'],towing],
    burger:[['','Rol','Functie','Naam'],citizen]
  };
  const info=[['Naam','PZ check','Status','Basis','Logistiek','Ladderwagen','Duiker',
    'Signalisatie','RED team','Gevaarlijke stoffen','Grote Boot','Discord','OUDE NAMEN'],
    ['FIRE_MEMBER','','Actief','Docent','','','','','','','',idC,'OLD_FIRE_MEMBER']];
  const originalFire=[...personnel.brandweer[1]];
  const plan=planPersonnelMigration(personnel,[],null,{brandweerInfo:info});
  assert.equal(plan.records.length,5);
  const persons=new Map(plan.records.map(r=>[r.personnel.dept,r.personnel]));
  assert.equal(persons.get('brandweer').personId,idC);
  assert.equal(persons.get('brandweer').call,'ZONE');
  assert.equal(persons.get('brandweer').specialties[0].value,'Docent');
  assert.equal(persons.get('politie').personId,idA);
  assert.equal(persons.get('politie').specialties[0].value,'Ja');
  assert.equal(persons.get('ambulance').personId,idB);
  assert.equal(persons.get('depannage').personId,idD);
  assert.equal(persons.get('burger').personId,idE);
  assert.deepEqual(personnel.brandweer[1],originalFire,'Het Google Sheet-bronrecord mag niet worden gewijzigd');
  assert.ok(plan.records.every(r=>/^\d{15,22}$/.test(r.personnel.personId)));
});

test('Live sync imports no ambiguous or conflicting firefighter dossier identity',()=>{
  const idA='111111111111111111',idB='222222222222222222';
  const main=['ZONE','','Brandweerman','FIRE_MEMBER','Actief']; main[13]=idA;
  const personnel={
    politie:[['Callsign','Graad','','Naam']],
    ambulance:[['Callsign','Kader','Functie','Naam']],
    brandweer:[['Callsign','Kader','Functie','Naam'],main],
    depannage:[['Callsign','Kader','Functie','Naam']],
    burger:[['','Rol','Functie','Naam']]
  };
  const info=[['Naam','PZ check','Status','Basis','Logistiek','Ladderwagen','Duiker',
    'Signalisatie','RED team','Gevaarlijke stoffen','Grote Boot','Discord','OUDE NAMEN'],
    ['FIRE_MEMBER','','','','','','','','','','',idB,'']];
  const plan=planPersonnelMigration(personnel,[],null,{brandweerInfo:info});
  assert.equal(plan.records.length,0);
  assert.equal(plan.unmatched.some(x=>x.reason==='tegenstrijdige_discord_ids'),true);
  assert.equal(personnel.brandweer[1][13],idA);
  // Two independent IDs claiming the same name are ambiguous.
  main[13]='';
  info.push(['FIRE_MEMBER','','','','','','','','','','',idA,'']);
  const clash=planPersonnelMigration(personnel,[],null,{brandweerInfo:info});
  assert.equal(clash.records.length,0);
  assert.equal(clash.unmatched.some(x=>x.reason==='meerdere_brandweerinfo_kandidaten'),true);
});

test('Main personnel sync reads all five source tabs without writing over audit records',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/burger:'BURGERS!A3:H180'/);
  assert.match(server,/brandweerInfo:'BrandweerInfo!A1:M150'/);
  assert.match(server,/planPersonnelMigration\(personnel,activityRows,null,\{brandweerInfo\}\)/);
  assert.match(server,/getFirestore\(\)\.collection\(PERSONNEL_EDITS_COLLECTION\)/);
  assert.match(server,/mergePersonnelEdits\(combined,edits\.docs\.map/);
  assert.match(server,/return plan\.records\.map\(row=>/);
});
