import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const html=read('../public/personeelsbeheer.html');
const begin=html.indexOf('async function load(){');
const end=html.indexOf('function staffField(',begin);
const load=html.slice(begin,end);

test('personnel overview and independent settings start concurrently before the first await',()=>{
 const requests=[
  "const columnsPromise=request('/api/roster-columns')",
  "const groupSettingsPromise=request('/api/personnel-group-settings')",
  "const groupRightsPromise=request('/api/personnel-group-settings/edit-permissions')",
  "const overviewPromise=request('/api/personnel/overview')",
  "const artworkPromise=request('/api/role-artwork/manifest')",
  "const leavePromise=request('/api/leave/roster-active')"
 ];
 const barrier=load.indexOf('const [cfg,data]=await Promise.all([columnsPromise,overviewPromise])');
 assert.ok(barrier>0);
 for(const name of requests)assert.ok(load.indexOf(name)>0&&load.indexOf(name)<barrier,name);
 assert.match(load,/const loadStartedAt=performance\.now\(\)/);
});

test('only authorised personnel and column layout block first roster render',()=>{
 const barrier=load.indexOf('const [cfg,data]=await Promise.all([columnsPromise,overviewPromise])');
 const paint=load.indexOf('render();updateFicheColleagues();updatePersonnelView()',barrier);
 const leaves=load.indexOf('void leavePromise.then(todayLeave=>',barrier);
 const arts=load.indexOf('void artworkPromise.then(artwork=>',barrier);
 const groups=load.indexOf('void Promise.all([groupSettingsPromise,groupRightsPromise])',barrier);
 assert.ok(paint>barrier&&leaves>paint&&arts>paint&&groups>paint);
 assert.match(load,/personnelManagementAllowed=true/);
 assert.match(load,/personnelCompactViews\.setScopedPersonnel\(people,data\.departments\|\|\[\]\)/);
 assert.match(load,/activeLeaveRosterLoadState='loading'/);
 assert.match(load,/activeLeaveRosterLoadState=todayLeave\?'ready':'unavailable'/);
 assert.match(html,/verlofstatus niet geverifieerd/);
});

test('late results cannot cross authenticated viewer or a newer load',()=>{
 assert.match(html,/let personnelOverviewLoadSerial=0/);
 assert.match(load,/const loadSerial=\+\+personnelOverviewLoadSerial/);
 assert.match(load,/const viewerUid=auth\?\.currentUser\?\.uid\|\|''/);
 assert.match(load,/if\(loadSerial!==personnelOverviewLoadSerial\|\|auth\?\.currentUser\?\.uid!==viewerUid\)return/);
 assert.match(load,/const stillCurrent=\(\)=>loadSerial===personnelOverviewLoadSerial&&/);
 assert.match(load,/if\(!stillCurrent\(\)\)return/);
 assert.match(load,/rosterCanEdit=cfg\.canEdit===true/);
 assert.match(load,/personnelGroupSettingsAllowed=Boolean\(groupMeta\)&&Object\.values/);
 const backend=read('../src/personnel-editor-routes.js');
 assert.match(backend,/app\.get\('\/api\/personnel\/overview',requireDossierUser/);
 assert.match(backend,/const allowed=\[\.\.\.new Set/);
});

test('frontend module remains parseable and optional API errors cannot erase the secure overview',()=>{
 const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(match);
 const parsed=spawnSync(process.execPath,['--check','--input-type=module'],{
  input:match[1],encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
 assert.match(load,/artworkPromise=request\('\/api\/role-artwork\/manifest'\)\.catch\(\(\)=>null\)/);
 assert.match(load,/leavePromise=request\('\/api\/leave\/roster-active'\)\.catch\(\(\)=>null\)/);
});
