import test from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
// Validate real ES-module syntax (imports and top-level await included).
function assertModuleSyntax(source){
 const result=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:source,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}

import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Personnel page keeps one combined dossier and scripts remain syntactically valid',()=>{
  const html=load('public/personeelsbeheer.html');
  const matches=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length,1);
  assertModuleSyntax(matches[0][1]);
  for(const name of ['staffDossierSection','staffDossierSummary','staffProfileForm',
    'staffLinkedTraining','staffLinkedCases','staffDossierHistory','staffStartDate','staffUnit','staffFunction'])
    assert.ok(html.includes('id="'+name+'"'),name);
  assert.ok(html.includes('await loadStaffDossier(p)'));
  assert.equal(html.includes('id="staffNoteForm"'),false,'A second note form must not exist');
  assert.ok(html.includes("'/api/training/'"));
  assert.ok(html.includes("'/api/management/cases?dept='"));
  assert.ok(html.includes('/weekrapporten.html'));
  assert.equal(html.includes('staffNoteForm'),false);
  assert.ok(html.includes("'/rollen-opleidingen.html'")||html.includes('href="/rollen-opleidingen.html"'));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});
test('Staff routes enforce authorised read, separate write flag, and immutable audit',()=>{
  const route=load('src/staff-dossier-routes.js');
  assert.ok(route.includes("app.get('/api/staff-dossiers/:dept/:discordId',requireUser"));
  assert.ok(route.includes("app.post('/api/staff-dossiers/:dept/:discordId/profile',requireUser"));
  assert.ok(route.includes("app.post('/api/staff-dossiers/:dept/:discordId/notes',requireUser"));
  assert.ok(route.includes("respond(res,410,'Gebruik Kaderregistraties"));
  assert.equal(route.includes('validateStaffNote('),false);
  assert.equal(route.includes("tx.create(noteId"),false);
  assert.ok(route.includes("staffDossierWritesEnabled(process.env)"));
  assert.ok(route.includes("canMaintainStaffDossier(req.bpd,staff)"));
  assert.ok(route.includes("getSubject(req,getSnapshot)"));
  assert.ok(route.includes("uniqueStaffSubject(snap.data"));
  assert.ok(route.includes('tx.create(ref.collection(\'audit\').doc()'));
  assert.equal(route.includes('tx.delete('),false);
  assert.equal(route.includes('discordRoleIds'),false);
  assert.equal(route.includes('PERSONNEL_SPREADSHEET_ID'),false);
});
test('No duplicate personnel roster and no changes to public unauthenticated access',()=>{
  const server=load('src/server.js');
  assert.ok(server.includes('installStaffDossierRoutes(app,{requireUser:requireDossierUser,getSnapshot});'));
  assert.ok(server.includes("app.use('/api/staff-dossiers',express.json"));
  const html=load('public/personeelsbeheer.html');
  assert.ok(html.includes('/api/personnel/overview'));
  assert.ok(html.includes('/api/personnel/:dept/:discordId')===false);
});
