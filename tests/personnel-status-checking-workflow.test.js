import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {EDITABLE_STATUSES,LEGACY_PERSONNEL_STATUSES}
 from '../src/personnel-editor-policy.js';
import {ACTIVITY_FOLLOWUP_LABELS,activityPingRegistration}
 from '../src/activity-followup-status-policy.js';
import {projectLeaveReturnChecking}
 from '../src/personnel-return-status-projection.js';
import {departureEvidence} from '../src/personnel-departure-evidence.js';
import {validateManagementEntry,reportSections} from '../src/management-utils.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const person={dept:'politie',personId:'123456789012345678',name:'Testlid',call:'700',
 status:'Actief',rank:'Hoofdinspecteur',series:'Reeks 2',lifecycleState:'active',
 specialties:[{label:'K9',value:'Ja'},{label:'RAGO',value:'Stage'},
 {label:'MOTARD',value:'Nee'}]};
const leave=(endDate,other={})=>({status:'approved',personDiscordId:person.personId,
 startDate:'2026-11-01',endDate,...other});
const check=endDate=>({dept:'politie',discordId:person.personId,status:'CHECKING',endDate});
test('negen handmatig selecteerbare statussen en oude Firestore-waarden blijven leesbaar',()=>{
 assert.deepEqual(EDITABLE_STATUSES,['ACTIEF','50/50','NON-ACTIEF','INACTIEF',
  'CHECKING','VERLOF','ONTSLAG','GESCHORST','VERWIJDERD']);
 assert.ok(LEGACY_PERSONNEL_STATUSES.includes('In opleiding'));
 assert.ok(LEGACY_PERSONNEL_STATUSES.includes('Actief'));
});
test('goedgekeurd afgerond verlof komt in CHECKING; oude graad blijft onaangeroerd',()=>{
 const p=projectLeaveReturnChecking([person],[check('2026-11-12')],
  [leave('2026-11-12')],'2026-11-19')[0];
 assert.equal(p.status,'CHECKING');
 assert.equal(p.statusBeforeChecking,'Actief');
 assert.equal(p.leaveReturnEndDate,'2026-11-12');
 assert.equal(p.rank,'Hoofdinspecteur');
});
test('huidige verlenging, oud checkrecord, niet-goedgekeurd of terminal status verhindert CHECKING',()=>{
 const base=[person];
 assert.equal(projectLeaveReturnChecking(base,[check('2026-11-12')],
  [leave('2026-11-12'),{...leave('2026-11-30'),startDate:'2026-11-13'}],
  '2026-11-19')[0].status,'Actief');
 assert.equal(projectLeaveReturnChecking(base,[check('2026-11-12')],
  [leave('2026-11-12'),{...leave('2026-11-18'),startDate:'2026-11-14'}],
  '2026-11-19')[0].status,'Actief');
 assert.equal(projectLeaveReturnChecking(base,[check('2026-11-12')],
  [{...leave('2026-11-12'),status:'pending'}],'2026-11-19')[0].status,'Actief');
 assert.equal(projectLeaveReturnChecking([{...person,status:'GESCHORST'}],
  [check('2026-11-12')],[leave('2026-11-12')],'2026-11-19')[0].status,'GESCHORST');
 assert.equal(projectLeaveReturnChecking([{...person,lifecycleState:'archived'}],
  [check('2026-11-12')],[leave('2026-11-12')],'2026-11-19')[0].status,'Actief');
});
test('een tussentijdse controleping registreert een echte Discord-attestatie en weekrapport',()=>{
 const fields=activityPingRegistration({activityStatus:'TUSSENTIJDSE_CONTROLE_PING',
  discordPingSent:true,discordPingDate:'2026-11-19'});
 assert.equal(fields.activityStatus,'TUSSENTIJDSE_CONTROLE_PING');
 assert.match(ACTIVITY_FOLLOWUP_LABELS.TUSSENTIJDSE_CONTROLE_PING,/controleping/i);
 const record=validateManagementEntry({type:'inactiviteitsping',eventDate:'2026-11-19',
  details:'Tussentijdse controle van medewerker in CHECKING na verlopen verlof.',
  ...fields});
 const reports=reportSections([{...record,registeredBy:{name:'Officier',call:'930'}}],
  '2026-11-16','2026-11-29');
 assert.equal(reports.find(x=>x.type==='inactiviteitsping').entries.length,1);
});
test('archivering bewaart de exacte oorspronkelijke graad, reeks, call en specialisaties',()=>{
 const e=departureEvidence(person,[person,
  {...person,dept:'brandweer',rank:'Sergeant'}],'inactive_dismissal',
  'Na eerdere activiteitenping geen terugkeer gezien');
 assert.match(e.details,/Collega verwijderd wegens inactiviteit/);
 assert.match(e.details,/Toenmalige graad: Hoofdinspecteur/);
 assert.match(e.details,/Roepnummer: 700/);
 assert.match(e.details,/Reeks: Reeks 2/);
 assert.match(e.details,/K9 \(Ja\)/);
 assert.match(e.details,/RAGO \(Stage\)/);
 assert.doesNotMatch(e.details,/MOTARD \(Nee\)/);
 assert.match(e.details,/Politie, Brandweer/);
 assert.equal(e.previousRank,'Hoofdinspecteur');
 assert.match(departureEvidence(person,[],'voluntary_discord_leave',
  'Discord vrijwillig verlaten').details,/verlaten Discord/);
});
test('archiveren vereist afzonderlijke bevoegde beslissing, logt beweging en ping atomair',()=>{
 const r=read('src/personnel-lifecycle-routes.js');
 assert.match(r,/if\(!allowed\(req\.bpd,person\)\)/);
 assert.match(r,/validateLifecycleAction\(req\.body,action\)/);
 assert.match(r,/if\(action==='archive'\)/);
 assert.match(r,/source:'personnel-lifecycle-archive'/);
 assert.match(r,/type:'personeelsbeweging',reportCategory:'personeelsbeweging'/);
 assert.match(r,/(newRank:action==='archive'\?'Ontslag'|newRank:'Ontslag')/);
 assert.match(r,/activityStatus:'VERWIJDERD',discordPingSent:false/);
 assert.match(r,/departureEvidence\(historic,archiveSubjects,input\.cause,input\.reason\)/);
});
test('manuele ACTIEF/50-50 wijziging sluit open verlofcontrole met dossieraudit',()=>{
 const r=read('src/personnel-editor-routes.js');
 assert.match(r,/subject\.leaveReturnChecking===true/);
 assert.match(r,/tx\.update\(checkRef,\{status:proposed\.status/);
 assert.match(r,/source:'leave-return-personnel-edit'/);
 const server=read('src/server.js');
 assert.match(server,/projectLeaveReturnChecking\(visible/);
 assert.match(server,/BPD_ENABLE_LEAVE_RETURN_CHECKS/);
});
test('formulier toont ping en veilige archiefkeuze zonder automatische ontslagbeslissing',()=>{
 const p=read('public/personeelsbeheer.html');
 assert.match(p,/option value="TUSSENTIJDSE_CONTROLE_PING"/);
 assert.match(p,/id="archiveFromActivityPing"/);
 assert.match(p,/4 = Ontslag wegens inactiviteit/);
 assert.match(p,/Personeelsstatus/); 
 const script=p.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const check=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:script,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
