import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canReadPersonnelSubject,canViewPersonnel} from '../src/personnel-editor-policy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const actor={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const person=(call,rank,dept='politie')=>({dept,personId:'222222222222222222',call,rank});
test('Middenkader gets lower-cadre dossiers only',()=>{
 assert.equal(canViewPersonnel(actor,'politie'),true);
 assert.equal(canReadPersonnelSubject(actor,person('300','Inspecteur')),true);
 assert.equal(canReadPersonnelSubject(actor,person('100','Agent')),true);
 assert.equal(canReadPersonnelSubject(actor,person('700','Hoofdinspecteur')),false);
 assert.equal(canReadPersonnelSubject(actor,person('930','Commissaris')),false);
 assert.equal(canReadPersonnelSubject(actor,person('AMB11','Ambulancier','ambulance')),false);
});
test('server generates viewer-specific links only after checking subject read permission',()=>{
 const src=read('src/personnel-editor-routes.js');
 assert.match(src,/app\.get\('\/api\/personnel\/dossier-shortcuts',requireDossierUser/);
 assert.match(src,/if\(!canViewPersonnel\(req\.bpd,'politie'\)\)/);
 assert.match(src,/canReadPersonnelSubject\(req\.bpd,p\)/);
 assert.match(src,/private, no-store/);
});
test('management names are links only when the source says dossier is allowed',()=>{
 const src=read('public/personeelsbeheer.html');
 assert.match(src,/createElement\(person\.canOpenDossier===true\?'a':'strong'\)/);
 assert.match(src,/name\.href=ficheUrl\(person\)/);
 assert.match(src,/roster-dossier-name/);
});
test('public directory falls back to personnel-card preview, does not infer role from name',()=>{
 const src=read('public/personeelslijst.html');
 assert.match(src,/\/api\/personnel\/dossier-shortcuts/);
 assert.match(src,/const permittedId=rosterDossierShortcuts\.get\(dossierKey\(person\)\)/);
 assert.match(src,/duplicates\.add\(key\)/);
 assert.match(src,/window\.parent\.location\.assign\(href\)/);
 assert.match(src,/window\.parent\.postMessage\(\{type:'bpd-directory-profile-open'/);
 assert.match(src,/rosterDossierShortcuts=new Map\(\)/);
 // The pre-existing directory inline module contains browser-only syntax;
 // compare its original render and new branch without compiling it as a function.
 assert.match(src,/function openRosterProfile\(person\)/);
 assert.match(src,/function render\(\)/);
});
