import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('notification jump lists only panels left visible by permission-scoped loaders',()=>{
 const html=read('public/meldingen.html');
 assert.match(html,/id="notificationJumpBar"/);
 assert.match(html,/id="notificationJump"/);
 assert.match(html,/for\(const panel of group\.querySelectorAll\('\.notification-tile\[id\]'\)\)/);
 assert.match(html,/if\(panel\.hidden\)continue/);
 assert.match(html,/syncNotificationJump\(\);/);
 assert.match(html,/panel\?\.classList\.contains\('notification-tile'\)\|\|panel\.hidden/);
 assert.match(html,/if\(details\)details\.setAttribute\('open',''\)/);
 assert.match(html,/bar\.hidden=!visibleCount/);
 assert.match(html,/Promise\.allSettled\(loaders\.map\(fn=>fn\(\)\)\)/);
});

test('management tabs support direct links but continue to hide unauthorized sections',()=>{
 const html=read('public/gebruikersbeheer.html');
 for(const entry of ["accounts:'accounts'","manual:'rolherstel'","services:'dienstbeheer'",
 "artwork:'rolbadges'","uniform:'uniformbeheer'","to:'to-rechten'",
 "board:'bestuur'","leave:'verlofmachtigingen'"])
  assert.ok(html.includes(entry),entry);
 assert.match(html,/window\.addEventListener\('hashchange'/);
 assert.match(html,/const active=Object\.keys\(mapping\)\.filter\(k=>\$\(mapping\[k\]\)\.dataset\.authorized==='yes'\)/);
 assert.match(html,/btn\.hidden=!active\.includes\(btn\.dataset\.tab\)/);
 assert.match(html,/\$\(id\)\.hidden=!active\.includes\(tab\)\|\|tab!==tabChoice/);
 assert.match(html,/managementTabHashes\[tabChoice\]/);
 assert.match(html,/id="managementQuickLinks"/);
 assert.doesNotMatch(html,/href="\/gebruikersbeheer\.html#uniformbeheer" style=/);
});

test('grant scope helper describes, but cannot change, service-bound rights',()=>{
 const html=read('public/gebruikersbeheer.html');
 const center=read('public/beheercentrum.html');
 assert.match(html,/id="dossierGrantScope"/);
 assert.match(html,/function updateDossierGrantScope\(\)/);
 assert.match(html,/Geselecteerde hulpdienst:/);
 assert.match(html,/de server beoordeelt elke actie/);
 assert.match(html,/\$\('dossierGrantDept'\)\.addEventListener\('change',updateDossierGrantScope\)/);
 assert.match(center,/href="\/gebruikersbeheer\.html#rolbadges"/);
});

test('manager panels are immediately hidden when account or permissions change',()=>{
 const page=read('public/gebruikersbeheer.html');
 const start=page.indexOf('async function refresh(){');
 const end=page.indexOf("  if(!auth?.currentUser)",start);
 assert.ok(start>=0&&end>start);
 const setup=page.slice(start,end);
 assert.match(setup,/\$\(name\)\.dataset\.authorized='no'/);
 assert.match(setup,/\$\(name\)\.hidden=true/);
 assert.match(setup,/\$\('manageTabs'\)\.hidden=true/);
 assert.match(setup,/\$\('profileSwitcher'\)\.hidden=true/);
 assert.match(setup,/tabChoice=tabFromHash\(\)/);
});
