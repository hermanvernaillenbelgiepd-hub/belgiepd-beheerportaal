import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requiresExistingPersonnelSubject} from '../src/personnel-subject-route-policy.js';

test('New personnel intake never requires a pre-existing dossier',()=>{
  assert.equal(requiresExistingPersonnelSubject('/api/personnel/new'),false);
  assert.equal(requiresExistingPersonnelSubject('/api/personnel/call-suggestion'),true);
  assert.equal(requiresExistingPersonnelSubject('/api/personnel/overview'),true);
});

test('Individual dossier endpoints stay protected against unknown or ambiguous staff identities',()=>{
  for(const path of [
    '/api/personnel/politie/123456789012345678',
    '/api/personnel/politie/123456789012345678/name',
    '/api/personnel/politie/123456789012345678/rank-change',
    '/api/staff-dossiers/politie/123456789012345678',
    '/api/dossiercentrum/politie/123456789012345678',
    '/api/training/politie/123456789012345678',
    '/api/registrations/entries/123456789012345678',
    '/api/management/cases/123456789012345678'
  ]) assert.equal(requiresExistingPersonnelSubject(path),true,path);
  for(const path of ['/api/user/profile','/api/personnel','/api/personnel/new','/auth/discord/start',null,{}])
    assert.equal(requiresExistingPersonnelSubject(path),false,String(path));
});

test('Express middleware uses the new subject-route decision without bypassing standard authorization',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  assert.match(server,/const subjectPath=requiresExistingPersonnelSubject\(req\.path\)/);
  assert.match(server,/if\(subjectPath&&subjectDept&&/);
  assert.match(server,/if\(target\.length!==1\)/);
  assert.match(server,/if\(!canReadPersonnelSubject\(req\.bpd,target\[0\]\)\)/);
  assert.match(editor,/app\.post\('\/api\/personnel\/new',requireDossierUser/);
  assert.match(editor,/!personnelCreationEnabled\(process\.env\)/);
  assert.match(editor,/!canCreatePersonnel\(req\.bpd,proposed\.dept\)/);
  assert.match(editor,/!canAuthorisePoliceEntryRank\(req\.bpd,proposed\.dept,proposed\.rank\)/);
  assert.match(editor,/uniqueNewPerson\(snap\.data,proposed\)/);
});
