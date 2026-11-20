import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sprite=read('public/assets/bpd-ui-icons.svg');
const nav=read('public/bpd-navigation.js');
const css=read('public/bpd-ui-icons.css');
const ids=[...sprite.matchAll(/<symbol id="([a-z-]+)" viewBox="0 0 24 24">/g)]
  .map(match=>match[1]);

test('SVG file contains unique safe icon symbols, no active content',()=>{
  assert.equal(ids.length,32);
  assert.equal(new Set(ids).size,ids.length);
  assert.match(sprite,/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  for(const id of ['house','users','folder-open','activity','network',
    'graduation-cap','book-open','calendar-days','calendar-check',
    'clipboard-list','radio','bell','settings','wrench','sun','moon',
    'fire-truck','ambulance','shield-check','lock-keyhole','menu','x','search'])
    assert.ok(ids.includes(id),'missing symbol '+id);
  assert.doesNotMatch(sprite,/<script|<foreignObject|\son\w+=|https?:\/\/[^"]+\.js/ig);
});

test('SVG references only known symbols on the same origin',()=>{
  assert.match(nav,/function svgUiIcon\(name\)/);
  assert.match(nav,/STATIC_UI_ICONS\.includes\(name\)\?name:'file-text'/);
  assert.match(nav,/document\.createElementNS\('http:\/\/www\.w3\.org\/2000\/svg','svg'\)/);
  assert.match(nav,/use\.setAttribute\('href','\/assets\/bpd-ui-icons\.svg#'\+value\)/);
  assert.match(nav,/icon\.setAttribute\('aria-hidden','true'\)/);
  assert.match(nav,/icon\.setAttribute\('focusable','false'\)/);
  const navNames=nav.match(/const ICON_ROUTE=Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(navNames);
  const sourceNames=[...navNames[1].matchAll(/:'([a-z-]+)'/g)].map(x=>x[1]);
  for(const name of sourceNames)assert.ok(ids.includes(name),'unknown route icon '+name);
});

test('all rendered common interface icons are SVG: sidebar, modules, topbar, theme, mobile',()=>{
  assert.match(nav,/symbol\.append\(svgUiIcon\(iconNameFor\(item\.href,item\.label\)\)\)/);
  assert.match(nav,/icon\.append\(svgUiIcon\(iconNameFor\(link\.getAttribute\('href'\),label\)\)\)/);
  assert.match(nav,/badge\.replaceChildren\(svgUiIcon\(iconNameFor\(/);
  assert.match(nav,/setThemeButtonIcon\(button\)/);
  assert.match(nav,/renderThemeButton|setThemeButtonIcon/);
  assert.match(nav,/setMenuIcon\(mobile,open\)/);
  assert.match(nav,/link\.prepend\(svgUiIcon\('user-round'\)\)/);
  assert.match(nav,/action\.append\(svgUiIcon\('search'\)/);
  assert.match(nav,/icons\.href='\/bpd-ui-icons\.css'/);
});

test('theme colors are inherited and business assets stay unmodified',()=>{
  assert.match(css,/\.bpd-svg-icon \{/);
  assert.match(css,/stroke:currentColor/);
  assert.match(css,/#bpdSidebar/);
  assert.match(css,/\.portal \.module \.ico \.bpd-svg-icon/);
  assert.doesNotMatch(css,/\.rank-code|\.specialty-pictogram|\.police-kader-divider/);
  assert.doesNotMatch(css,/display:none!important/);
  new Script(nav,{filename:'bpd-navigation.js'});
});
