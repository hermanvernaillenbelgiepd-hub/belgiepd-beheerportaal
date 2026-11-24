import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canViewPersonnel,canReadPersonnelSubject} from '../src/personnel-editor-policy.js';
import {portalNavigationCapabilities} from '../src/portal-navigation-policy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('six status cards, default-open charts, priority first, archived RECORDS below',()=>{
 const ui=read('public/activity-dashboard.js');
 for(const key of ['active','half','inactive','leave','checking','review'])
  assert.ok(ui.includes("'"+key+"'"));
 assert.match(ui,/activityStatusTiles/);
 assert.match(ui,/const panels=\[filter,overview,graphs,priority,warning,ranking,records,roster\]/);
 assert.match(ui,/panels\.forEach/);
 assert.match(ui,/activityGraphs'\)\.open=true/);
 const html=read('public/activiteitscentrum.html');
 assert.match(html,/renderActivityDashboard\(scoped,sources/);
 assert.match(html,/activityStatusTileMatch\(p\)/);
 assert.match(html,/renderActivityGraphs\(\{people:visible,sources\}\)/);
});
test('theme responsive layout, valid inline script, no new API writes',()=>{
 const css=read('public/activity-dashboard.css');
 assert.match(css,/data-bpd-theme="dark"/);
 assert.match(css,/@media\(max-width:760px\)/);
 const html=read('public/activiteitscentrum.html');
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new Function(code.replace(/^import\s+.*?;\s*$/gm,'')));
 const ui=read('public/activity-dashboard.js');
 assert.doesNotMatch(ui,/fetch\(|\/api\/|firebase/);
});
test('Police Middenkader retains scoped read access, no higher cadre or foreign service',()=>{
 const id='111111111111111111',actor={uid:'discord:'+id,discordId:id,
  role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'},
  dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
 const person=(call,rank)=>({dept:'politie',personId:'222222222222222222',call,rank});
 assert.equal(portalNavigationCapabilities(actor,[]).activity,true);
 assert.equal(canViewPersonnel(actor,'politie'),true);
 assert.equal(canReadPersonnelSubject(actor,person('300','Inspecteur')),true);
 assert.equal(canReadPersonnelSubject(actor,person('700','Hoofdinspecteur')),false);
 assert.equal(canReadPersonnelSubject(actor,person('930','Commissaris')),false);
 assert.equal(canReadPersonnelSubject(actor,{dept:'ambulance',personId:'333333333333333333',call:'AMB',rank:'Ambulancier'}),false);
});

test('three accessible tabs group already-authorized activity sections',()=>{
 const ui=read('public/activity-dashboard.js'),css=read('public/activity-dashboard.css');
 assert.match(ui,/DASHBOARD_TABS=\[\['overview','Overzicht'\],\['followup','Opvolging'\],\['history','Historiek'\]\]/);
 assert.match(ui,/role','tab'/);
 assert.match(ui,/role','tabpanel'/);
 assert.match(ui,/root\.append\(tabs\.overview,tabs\.followup,tabs\.history\)/);
 assert.match(ui,/tabs\.history\.append\(records\)/);
 assert.match(ui,/selectTab\('followup'\);onSelect\(\)/);
 assert.match(css,/\.activity-tab-panel\[hidden\]/);
 assert.match(css,/aria-selected=true/);
});

test('maandcontrole is eerste t/m laatste kalenderdag en oude reset blijft historisch',()=>{
 const ui=read('public/activity-dashboard.js');
 assert.match(ui,/monthH\.textContent='Maandcontrole vanaf de 1ste'/);
 assert.match(ui,/minder dan 20 uur/);assert.match(ui,/minder dan 10 uur/);
 assert.match(ui,/De externe reset wordt hiermee niet aangepast/);
 assert.match(ui,/Te beoordelen afgesloten kalendermaand/);
 const html=read('public/activiteitscentrum.html');
 assert.match(html,/detail\.presetStatus==='ACTIEF'/);
 assert.ok(ui.includes("['half','inactive','checking'].includes(active)"));
 assert.match(ui,/Voorstel ACTIEF/);
});
