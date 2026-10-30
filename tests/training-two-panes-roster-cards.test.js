import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const academy=read('public/opleidingscentrum.html');
const registration=read('public/rollen-opleidingen.html');
const roster=read('public/personeelslijst.html');
const renderer=read('public/member-police-roster.js');
const hierarchy=read('public/organogram-hierarchie.html');

test('academy separates member requests and authorized training-registration pane',()=>{
 for(const id of ['requestTab','registerTab','requestPane','registerPane',
  'trainingRegisterSection','trainingRegisterFrame','inboxPanel','requestForm','mine'])
  assert.match(academy,new RegExp('id="'+id+'"'));
 assert.match(academy,/api\/training-requests/);
 assert.match(academy,/api\/roles\/me/);
 assert.match(academy,/p\?\.\['training\.log'\]===true/);
 assert.match(academy,/canReview=data\.canReviewTraining===true/);
 assert.match(academy,/trainingRegisterSection'\)\.hidden=!canRegister/);
 assert.match(academy,/trainingRegisterFrame'\);frame\.hidden=false/);
 assert.match(academy,/rollen-opleidingen\.html\?embedded=1/);
 assert.match(academy,/if\(pane==='register'&&\$\(\'registerTab\'\)\.hidden\)pane='request'/);
});
test('old protected training register is reused, not duplicated',()=>{
 assert.match(registration,/body\.training-embedded/);
 assert.match(registration,/api\/roles\/me/);
 assert.match(registration,/api\/training\/people/);
 assert.match(registration,/api\/training'/);
 assert.match(registration,/p\.permissions/);
 assert.match(registration,/trainingWritesEnabled/);
 assert.match(academy,/Te behandelen aanvragen/);
 assert.match(academy,/GELEZEN/);
});
test('roster names open the existing organogram card instead of showing private dossier data',()=>{
 assert.match(renderer,/onPersonClick=null/);
 assert.match(renderer,/nameButton\.addEventListener\('click',\(\)=>onPersonClick\(person\)\)/);
 assert.match(roster,/id="rosterProfile"/);
 assert.match(roster,/renderMemberPoliceRoster\(\$\('rosterHead'\),\$\('rows'\),people,q,openRosterProfile\)/);
 assert.match(roster,/URLSearchParams\(\{embedded:'1',dienst:'politie',kaart:call,naam:name\}\)/);
 assert.match(roster,/event\.origin!==location\.origin/);
 assert.match(hierarchy,/isEmbeddedCard=cardParams\.get\('embedded'\)==='1'/);
 assert.match(hierarchy,/if\(requestedCard\)\{/);
 assert.match(hierarchy,/if\(!state\.demo\)\{/);
 assert.match(hierarchy,/openPersonProfile\(person\)/);
 assert.match(hierarchy,/notifyCardParent\('ready'\)/);
 assert.match(hierarchy,/location\.origin/);
});
