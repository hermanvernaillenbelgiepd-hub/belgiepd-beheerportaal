import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const pages=[
  'brandweerdossier','bronnen','discord-diagnose','discord-status',
  'dossiercentrum','gebruikersbeheer','index','meldingen',
  'opleidingscentrum','personeel-koppelen','personeelsbeheer','personeelslijst',
  'registraties','roepnummers','rollen-opleidingen','to-dienstbord',
  'toegangsvoorbeeld','vast-roepnummer-aanvragen','verlofbeheer','weekrapporten'
];

test('All portal pages use the same sidebar and top navigation resources',()=>{
  for(const page of pages){
    const html=read(page+'.html');
    assert.match(html,/\/bpd-navigation\.css/,page+' missing shared styles');
    assert.match(html,/\/bpd-navigation\.js/,page+' missing shared script');
  }
});

test('Homepage role-aware sidebar is reused, never overlaid with a duplicate',()=>{
  const js=read('bpd-navigation.js');
  assert.match(js,/if\(here==='\/'\|\|here==='\/index\.html'\)homepage\(\)/);
  assert.match(js,/const active=Array\.from\(sidebar\.querySelectorAll\('nav'\)\)/);
  assert.match(js,/\.find\(n=>!n\.hidden\)/);
  assert.match(js,/MutationObserver\(update\)/);
  assert.match(js,/window\.self!==window\.top/);
});

test('Subpage sidebar starts with safe links and waits for server-confirmed roles',()=>{
  const js=read('bpd-navigation.js');
  assert.match(js,/show\(\['home','personnel','profile'\]\)/);
  assert.match(js,/fetch\('\/api\/dashboard\/admin-visibility'/);
  assert.match(js,/fetch\('\/api\/member\/dashboard'/);
  assert.match(js,/context\?\.showAdvancedDashboard===true/);
  assert.match(js,/context\.ambulanceCanOpenDossier===true/);
  assert.match(js,/context\.ambulanceReportVerified===true/);
  assert.match(js,/item!=='admin'\|\|context\.visible===true/);
  assert.match(js,/Do not initialize Firebase here/);
  assert.doesNotMatch(js,/initializeApp\(/);
});

test('Navigation is keyboard-friendly and mobile drawer is not intrusive',()=>{
  const js=read('bpd-navigation.js'),css=read('bpd-navigation.css');
  assert.match(js,/setAttribute\('aria-expanded','false'\)/);
  assert.match(js,/event\.key==='Escape'/);
  assert.match(js,/id='bpdMenuToggle'/);
  assert.match(css,/#bpdSidebar\{position:fixed/);
  assert.match(css,/@media\(max-width:930px\)/);
  assert.match(css,/\.bpd-menu-open #bpdSidebar/);
  assert.match(css,/#bpdQuicknav/);
  assert.match(css,/body:has\(#memberDashboard:not\(\[hidden\]\)\) \.portal>aside\{display:flex\}/);
});

test('Staff roster and read-only personnel table are shorter, never less informative',()=>{
  const staff=read('personeelsbeheer.html'),readonly=read('member-police-roster.css');
  assert.match(staff,/\.staff-roster-table\{min-width:1330px/);
  assert.match(staff,/\.staff-roster-table tbody td\{padding:5px 5px!important/);
  assert.match(staff,/width:67px!important;height:33px!important/);
  assert.match(staff,/\.discord-copy-btn\{padding:2px 5px/);
  assert.match(staff,/\.specialty-status-col \.specialty-state/);
  assert.match(readonly,/\.mr-table\{min-width:1280px\}/);
  assert.match(readonly,/\.mr-table td\{padding:5px 6px/);
  assert.match(readonly,/\.mr-insignia\{width:33px/);
  assert.match(readonly,/\.mr-specialty\{padding:4px 3px/);
  // Shared read-only roster never receives edit actions from these CSS changes.
  assert.doesNotMatch(readonly,/\/api\//);
});
