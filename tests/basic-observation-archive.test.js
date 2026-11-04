import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayArchiveBasicObservation,mayReadBasicInbox} from '../src/basic-observation-policy.js';
import {receivedAccess} from '../src/received-registration-policy.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const person={dept:'politie',personId:'208208208208208208',call:'208',
 rank:'Agent van Politie',name:'Tipshiva'};
const actor=role=>({
 role,discordId:'930930930930930930',
 departments:['politie'],departmentRoles:{politie:role},
 dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']
});

test('Middenkader mag ontvangen observaties zien maar niet globaal archiveren',()=>{
 const mk=actor('middenkader');
 assert.equal(mayReadBasicInbox(mk),true);
 assert.equal(receivedAccess(mk,person).includes('basiskader'),true);
 assert.equal(mayArchiveBasicObservation(mk),false);
 assert.equal(mayArchiveBasicObservation(actor('basiskader')),false);
});
test('Politie Officierenkader, Korpsleiding en afzonderlijk Bestuur mogen veilig archiveren',()=>{
 assert.equal(mayArchiveBasicObservation(actor('officierenkader')),true);
 assert.equal(mayArchiveBasicObservation(actor('korpsleiding')),true);
 assert.equal(mayArchiveBasicObservation({...actor('basiskader'),boardPersonnelAdmin:true}),true);
 assert.equal(mayArchiveBasicObservation({...actor('officierenkader'),
  departments:['brandweer']}),false);
 assert.equal(mayArchiveBasicObservation({...actor('officierenkader'),
  dossierAllowedDepartments:[]}),false);
 assert.equal(mayArchiveBasicObservation({...actor('officierenkader'),
  departmentRoles:{politie:'basiskader'}}),false);
});
test('Archiveren blijft altijd een soft-archive met per-dossiercontrole en audittrail',()=>{
 const src=source('src/basic-observation-routes.js');
 const start=src.indexOf("app.patch('/api/basic-observations/:id/archive'");
 const end=src.indexOf("app.get('/api/basic-observations/inbox'",start);
 assert.ok(start>0&&end>start,'Archive route must precede inbox');
 const route=src.slice(start,end);
 assert.match(route,/mayArchiveBasicObservation\(req\.bpd\)/);
 assert.match(route,/typeof body\.archived!=='boolean'/);
 assert.match(route,/Object\.keys\(body\)\.some\(key=>key!=='archived'\)/);
 assert.match(route,/staffCount\(roster,entry\.subjectDiscordId\)/);
 assert.match(route,/receivedAccess\(req\.bpd,subjects\[0\]\)\.includes\('basiskader'\)/);
 assert.match(route,/tx\.update\(ref,\{archivedAt:body\.archived\?at:null/);
 assert.match(route,/collection\('bpd_basic_observation_audit'\)/);
 assert.match(route,/action:body\.archived\?'archive':'restore'/);
 assert.match(route,/unchanged:true/);
 assert.doesNotMatch(route,/tx\.delete\(|\.delete\(/);
 assert.doesNotMatch(route,/entry\.details\s*=/);
});
test('Gescheiden Actief- en Archief-overzichten met bestaande rangbeperkingen',()=>{
 const src=source('src/basic-observation-routes.js');
 const ui=source('public/registraties.html');
 assert.match(src,/view=String\(req\.query\.view\|\|'active'\)/);
 assert.ok(src.includes("!['active','archived'].includes(view)"));
 assert.match(src,/\(e\.archivedAt!=null\)!==\(view==='archived'\)/);
 assert.match(src,/archivedAt:iso\(e\.archivedAt\)/);
 assert.match(src,/nextCursor:snapshots\.docs\.length===160/);
 assert.match(ui,/id="inboxView"/);
 assert.match(ui,/value="active">Actieve observaties/);
 assert.match(ui,/value="archived">Archief/);
 assert.match(ui,/row\.archivedAt\?'Terugzetten naar actief':'Archiveren'/);
 assert.ok(ui.includes("api('/api/basic-observations/'+encodeURIComponent(row.id)+'/archive'"));
 assert.match(ui,/await loadInbox\(\)/);
});
