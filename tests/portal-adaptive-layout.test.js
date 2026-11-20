import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const modules=[
 'activiteitscentrum','beeldbibliotheek','beheercentrum','brandweerdossier',
 'bronnen','burger-personeelsdossiers','dc-id-overdracht','discord-diagnose',
 'discord-status','documentencentrum','dossiercentrum','gebruikersbeheer',
 'index','koppelritten','meldingen','opleidingscentrum','opleidingskalender',
 'opleidingsplanning','opleidingstraject','organogram-hierarchie',
 'personeel-koppelen','personeelsbeheer','personeelslijst','registraties',
 'roepnummers','rollen-opleidingen','rollenbeheer','technische-rollen-simulatie',
 'testgegevens-opschonen','to-dienstbord','toegangsvoorbeeld',
 'vast-roepnummer-aanvragen','verlofbeheer','voltooide-opleidingen','weekrapporten'
];
test('all 35 active HTML pages opt into the shared adaptive stylesheet',()=>{
 assert.equal(modules.length,35);
 const nav=read('public/bpd-navigation.js');
 assert.match(nav,/adaptive\.href='\/bpd-adaptive-layout\.css'/);
 assert.match(nav,/setAttribute\('data-bpd-adaptive-page',adaptivePage\)/);
 // The adaptive CSS is also loaded in embedded roster iframes, before the
 // shared nav deliberately returns without duplicating the side menu.
 assert.ok(nav.indexOf('bpdAdaptiveLayoutStyles')<
   nav.indexOf('if(window.self!==window.top)return'));
 for(const name of modules){
  const html=read('public/'+name+'.html');
  assert.match(html,/bpd-navigation\.js/,name);
  assert.match(html,/name="viewport"/,name);
 }
 const alias=read('public/organogram.html');
 assert.match(alias,/url=\/organogram-hierarchie\.html/);
});
test('desktop and widescreen use available space without outer page caps',()=>{
 const css=read('public/bpd-adaptive-layout.css');
 assert.match(css,/body\.bpd-shell > main:not\(\.workspace\)/);
 assert.match(css,/body\.bpd-shell > main\.workspace/);
 assert.match(css,/width:100% !important;/);
 assert.match(css,/max-width:none !important;/);
 assert.match(css,/margin-inline:0 !important;/);
 assert.match(css,/#personnelPublicView/);
 assert.match(css,/#personnelOriginalDirectory/);
 assert.match(css,/#personnelDirectoryFrame/);
});
test('responsive groups adapt on tablets and phones without hiding fields',()=>{
 const css=read('public/bpd-adaptive-layout.css');
 assert.match(css,/@media screen and \(max-width:1100px\)/);
 assert.match(css,/@media screen and \(max-width:680px\)/);
 assert.match(css,/repeat\(auto-fit,minmax\(min\(100%,225px\),1fr\)\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.form-grid/);
 assert.match(css,/\.service-grid/);
 assert.match(css,/\.summary-grid/);
 assert.match(css,/\.dossier-sheet \.sheet-grid/);
 assert.match(css,/\.bpd-ref-search/);
});
test('personnel and operational grids keep real data, statuses and buttons',()=>{
 const css=read('public/bpd-adaptive-layout.css');
 const navCss=read('public/bpd-navigation.css');
 const roster=read('public/personeelsbeheer.html');
 assert.match(css,/:not\(table\):not\(\.mr-table\):not\(\.staff-roster-table\)/);
 assert.match(css,/overflow-x:auto;/);
 assert.match(css,/overscroll-behavior-inline:contain/);
 assert.match(css,/body\.roster-embedded/);
 assert.match(roster,/staff-roster-table/);
 assert.match(navCss,/table\.bpd-adaptive-cards/);
 assert.match(navCss,/bpd-mobile-list-row/);
 assert.match(css,/:not\(\[data-bpd-adaptive-page="to-dienstbord"\]\)/);
 assert.doesNotMatch(css,/(?:display:none|visibility:hidden)\s*!important/);
 assert.doesNotMatch(css,/\.rank-code|\.series-r[123]|\.status-active|\.specialty-pictogram/);
});
