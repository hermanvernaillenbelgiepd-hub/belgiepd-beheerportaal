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

test('navigatie hergebruikt alleen kort geldige UI-context voor dezelfde Firebase-gebruiker',()=>{
 const nav=read('public/bpd-navigation.js');
 for(const value of ['navCacheTtlMs=20*1000','saved?.uid!==uid',
  'cachedNavView(user.uid)','saveNavView(user.uid,context,member,citizen)',
  'if(!user){clearNavView()','getIdToken()'])
  assert.ok(nav.includes(value),'Verwachte navigatiebeveiliging: '+value);
 assert.ok(!nav.includes('sessionStorage.setItem(navCacheKey,token)'));
});
test('opleidingsregister vernieuwt rechten en personeelslijst niet dubbel bij initialisatie',()=>{
 const register=read('public/rollen-opleidingen.html');
 assert.ok(register.includes('onAuthStateChanged(auth,()=>refresh())'));
 assert.ok(!register.includes('await auth.authStateReady();await refresh()'));
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

test('opleidingsregister voert Belgische datumweergave in, met ISO-opslag',()=>{
 const page=read('public/rollen-opleidingen.html');
 const dossier=read('public/personeelsbeheer.html');
 const helper=read('public/bpd-date-inputs.js');
 assert.match(page,/id="date" type="date" required/);
 assert.match(page,/Datum \(dd\/mm\/jjjj\)/);
 assert.match(page,/from '\/bpd-date-inputs\.js'/);
 assert.match(page,/enhanceBelgianDateInputs\(\['date','expiry'\]\)/);
 assert.match(page,/refreshBelgianDateInputs\(\['date'\]\)/);
 assert.match(page,/formatBelgianDateInput\(r\.eventDate\)/);
 assert.match(page,/parseBelgianDateInput\(\$\('dateText'\)\?\.value\|\|\$\('date'\)\.value\)/);
 assert.match(page,/eventDate:trainingDate/);
 assert.match(page,/brusselsToday\(\)/);
 assert.match(page,/timeZone:'Europe\/Brussels'/);
 assert.match(dossier,/enhanceBelgianDateInputs\(\['leaveFrom','leaveUntil','staffStartDate','staffTrainingDate'/);
 assert.match(helper,/field\.placeholder='dd\/mm\/jjjj'/);
});
