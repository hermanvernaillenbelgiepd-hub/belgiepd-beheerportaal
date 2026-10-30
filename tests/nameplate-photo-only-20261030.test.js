import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('only the approved photographic textile file is an active police nameplate asset',()=>{
 const photo=read('assets/bpd-naamplaat-foto-basis-20261030.svg');
 const css=read('assets/organogram-police-formal.css');
 const studio=read('gebruikersbeheer.html');
 const js=read('assets/organogram-police-formal.js');
 const composer=read('uniform-composer-ui.js');
 assert.match(photo,/data:image\/webp;base64,/);
 assert.doesNotMatch(photo,/PZ BERLARE|BERLAAR|THIJS|BELGIEPD - 900/);
 assert.equal(existsSync(new URL('../public/assets/bpd-naamplaat-geweven-leeg-20261028.webp',import.meta.url)),false);
 for(const ui of [css,studio])
  assert.match(ui,/bpd-naamplaat-foto-basis-20261030\.svg/);
 for(const file of [css,studio,js,composer])
  assert.doesNotMatch(file,/bpd-gold-nameplate|bpd-silver-woven-nameplate|bpd-nameplate-mirrored-grade|compose-nameplate-left-accent/);
});

test('historical nameplate coordinate and lettering overrides cannot reappear',()=>{
 const js=read('assets/organogram-police-formal.js');
 assert.doesNotMatch(js,/uniformNameplateOverrides|applyUniformNameplatePlacement/);
 assert.match(js,/function makeWovenNameplate\(person,zoom=false\)/);
 assert.match(js,/return \{\.\.\.base,bottom:'BELGIEPD - '\+base\.call,nameScale:100,callScale:100\}/);
});
