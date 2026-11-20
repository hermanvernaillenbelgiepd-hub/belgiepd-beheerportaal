import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('reference style uses one scoped, reusable dark/light design language',()=>{
 const css=read('public/bpd-reference-dashboard.css');
 const nav=read('public/bpd-navigation.js');
 assert.match(nav,/classList\.add\('bpd-reference-ui'\)/);
 assert.match(nav,/reference\.href='\/bpd-reference-dashboard\.css'/);
 assert.match(css,/html\.bpd-reference-ui\[data-bpd-theme="light"\]/);
 assert.match(css,/--ref-sidebar:#101728/);
 assert.match(css,/--ref-card:#151d31/);
 assert.match(css,/#bpdSidebar \.bpd-side-links a\[aria-current="page"\]/);
 assert.match(css,/#staffDashboard \.module/);
 assert.match(css,/\.staff-roster-table tbody td/);
 assert.match(css,/\.dossier-tabbar button/);
 // These operation/status classes must not be restyled by the reference skin.
 assert.doesNotMatch(css,/\.rank-code|\.series-r[123]|\.status-active|\.specialty-pictogram/);
 assert.doesNotMatch(css,/#toBoardRoot .*background/);
});

test('topbar search is a real link/filter, never fabricated personnel data',()=>{
 const nav=read('public/bpd-navigation.js');
 const roster=read('public/personeelslijst.html');
 assert.match(nav,/function makeReferenceSearch\(source\)/);
 assert.match(nav,/source\(\)\.filter\(item=>item\.href&&item\.label\)/);
 assert.match(nav,/window\.location\.assign\('\/personeelslijst\.html\?zoek='/);
 assert.match(roster,/new URLSearchParams\(location\.search\)\.get\('zoek'\)/);
 assert.match(roster,/\$\('search'\)\.oninput=searchDirectory/);
});

test('authorization and theme choices still originate from existing portal checks',()=>{
 const nav=read('public/bpd-navigation.js');
 assert.match(nav,/verifyIdentity\(show\)/);
 assert.match(nav,/items\.find\(item=>item\.href===NAV\[key\]\?\.href\)/);
 assert.match(nav,/const themeKey='bpdPortalThemeV1'/);
 assert.match(nav,/function storedTheme\(\)/);
 assert.match(nav,/const current=items\.find\(item=>currentPage\(item\.href\)\)/);
 assert.match(nav,/for\(const item of items\)if\(!seen\.has\(item\.href\)\)/);
 assert.match(nav,/renderQuick\(items,top\)/);
});


test('TEST roster keeps its original table and scroll holder',()=>{
 const css=read('public/bpd-reference-dashboard.css');
 const roster=read('public/personeelsbeheer.html');
 assert.match(css,/max-width:640px/);
 assert.match(css,/auto-fit/);
 assert.match(roster,/<table class="staff-roster-table"/);
 assert.match(roster,/class="scroller staff-roster-holder"/);
});

test('left sidebar is sectioned on home for all department-specific menus',()=>{
 const nav=read('public/bpd-navigation.js');
 const css=read('public/bpd-reference-dashboard.css');
 const home=read('public/index.html');
 assert.match(nav,/function groupHomeSidebar\(\)/);
 assert.match(nav,/groupHomeSidebar\(\);/);
 assert.match(nav,/sidebar\.querySelectorAll\('nav'\)/);
 assert.match(nav,/Array\.from\(menu\.children\)\.filter\(item=>/);
 for(const title of ['Algemeen','Personeel','Operationeel','Documenten en aanvragen','Beheer'])
   assert.match(nav,new RegExp("name:'"+title+"'"));
 assert.match(nav,/menu\.append\(output\)/);
 assert.match(nav,/heading\.hidden=!links\.some\(link=>!link\.hidden\)/);
 assert.match(nav,/attributeFilter:\['hidden'\]/);
 assert.match(css,/\.portal > aside nav \.bpd-ref-side-heading/);
 assert.match(css,/\.bpd-ref-side-heading\[hidden\]/);
 for(const id of ['staffNav','memberNav','zoneNav','ambulanceNav'])
   assert.match(home,new RegExp('id="'+id+'"'));
 assert.match(nav,/output\.append\(heading,\.\.\.links\)/);
 assert.match(nav,/verifyIdentity\(show\)/);
});
