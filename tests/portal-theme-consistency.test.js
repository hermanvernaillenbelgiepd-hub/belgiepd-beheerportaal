import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const nav=read('bpd-navigation.js'),css=read('bpd-navigation.css');
test('theme preference is global, remembered, and attached before iframe navigation stops',()=>{
 assert.match(nav,/bpdPortalThemeV1/);
 assert.match(nav,/window\.localStorage\?\.getItem\(themeKey\)/);
 assert.match(nav,/window\.localStorage\?\.setItem\(themeKey,currentTheme\)/);
 assert.match(nav,/document\.documentElement\?\.setAttribute\('data-bpd-theme',currentTheme\)/);
 assert.ok(nav.indexOf('applyTheme(currentTheme);')<nav.indexOf('if(window.self!==window.top)return'));
 assert.match(nav,/window\.addEventListener\?\.\('storage'/);
});
test('theme toggle belongs to the shared navigation of home and subpages',()=>{
 assert.match(nav,/bar\.append\(makeThemeToggle\(\)\)/);
 assert.match(nav,/quick\.append\(makeThemeToggle\(\)\)/);
 assert.match(nav,/setAttribute\('aria-pressed'/);
 assert.match(nav,/Overschakelen naar licht thema/);
 assert.match(nav,/Overschakelen naar donker thema/);
});
test('one design system covers light, dark, personnel and embedded organogram',()=>{
 for(const selector of [
  'html:not([data-bpd-theme="dark"])','html[data-bpd-theme="dark"]',
  '.staff-roster-table','.mr-table','.person-profile-dialog',
  '.portal .topbar','#bpdQuicknav .bpd-theme-toggle']){
   assert.ok(css.includes(selector),selector);
 }
 const hierarchy=read('organogram-hierarchie.html');
 assert.match(hierarchy,/\/bpd-navigation\.css/);
 assert.match(hierarchy,/\/bpd-navigation\.js/);
 assert.match(css,/@media screen\{/);
 assert.doesNotMatch(css,/@media print\{/);
});


test('Mijn profiel inner cards, foldouts, buttons and status follow the selected theme',()=>{
  for(const selector of [
    'html:not([data-bpd-theme="dark"]) body #profile :is(',
    'html[data-bpd-theme="dark"] body #profile :is(',
    '#connectionCard.verified-compact',
    '#connectionCard .status:not(.error)',
    'body :is(#profile,#connectionCard) a.button'
  ]) assert.ok(css.includes(selector),selector);
});
