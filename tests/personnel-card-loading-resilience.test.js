import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const card=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const management=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const roster=readFileSync(new URL('../public/personeelslijst.html',import.meta.url),'utf8');
const profile=card.split('function openPersonProfile(p){')[1]?.split("$('person-profile-close')")[0]||'';

test('AE artwork constants are initialized before the specialty patch lookup',()=>{
 const variant=profile.indexOf('const functionVariant=');
 const ids=profile.indexOf('const aeRoleIds=',variant);
 const specific=profile.indexOf('const aeSpecific=',ids);
 const lookup=profile.indexOf('const matchedArtwork=',specific);
 assert.ok(variant>=0&&ids>variant&&specific>ids&&lookup>specific,
  'AE constants must be declared before the find callback evaluates them');
});

test('embedded personnel card handles rendering errors without infinite loading',()=>{
 assert.match(card,/try\{\s*openPersonProfile\(person\);\s*notifyCardParent\('ready'\);/);
 assert.match(card,/catch\(error\)\{[\s\S]*?notifyCardParent\('unavailable'\);/);
 assert.match(card,/notifyCardParent\(state\.loaded\?'not-found':'unavailable'\)/);
});

test('both personnel card parents show a timeout message if the iframe never responds',()=>{
 for(const html of [management,roster]){
  assert.match(html,/LoadTimer=window\.setTimeout\(/);
  assert.match(html,/De personeelskaart reageert niet/);
  assert.match(html,/window\.clearTimeout\(/);
  assert.match(html,/\['ready','not-found','unavailable'\]/);
 }
});
