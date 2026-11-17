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

test('Gebundeld observatieoverzicht is uitsluitend toegankelijk vanaf Middenkader',()=>{
 assert.equal(mayReadBasicInbox(actor('agentenkader')),false);
 assert.equal(mayReadBasicInbox(actor('basiskader')),false);
 assert.equal(mayReadBasicInbox(actor('middenkader')),true);
 assert.equal(mayReadBasicInbox(actor('officierenkader')),true);
 assert.equal(mayReadBasicInbox(actor('korpsleiding')),true);
 assert.equal(mayReadBasicInbox({...actor('basiskader'),boardPersonnelAdmin:true}),true,
   'Bestuur heeft afzonderlijke toegangsrechten');
 const routes=source('src/basic-observation-routes.js');
 assert.match(routes,/app\.get\('\/api\/basic-observations\/inbox',requireUser/);
 assert.match(routes,/if\(!mayReadBasicInbox\(req\.bpd\)\)/);
 const ui=source('public/registraties.html');
 assert.match(ui,/\$\('inboxPanel'\)\.hidden=!data\.canReview/);
 assert.match(ui,/if\(!context\?\.canReview\)return/);
});
test('Observaties worden per personeelslid ingeklapt met teller, nieuwste eerst en uitklapbare details',()=>{
 const ui=source('public/registraties.html');
 assert.match(ui,/const groups=new Map\(\)/);
 assert.match(ui,/const key=row\.subject\?\.discordId/);
 assert.match(ui,/rows\.sort\(\(a,b\)=>createdMs\(b\)-createdMs\(a\)\)/);
 assert.match(ui,/for\(const \[key,entries\] of groups\)/);
 assert.match(ui,/group=document\.createElement\('details'\)/);
 assert.match(ui,/summary=document\.createElement\('summary'\)/);
 assert.match(ui,/group\.dataset\.subjectId=key/);
 assert.match(ui,/entries\.length\+' observatie'/);
 assert.match(ui,/items\.append\(article\)/);
 assert.match(ui,/group\.open=Boolean\(q\)\|\|openObservationGroups\.has\(key\)/);
 assert.match(ui,/if\(context\?\.canArchive\)/);
 assert.match(ui,/id="inboxView"/);
});
