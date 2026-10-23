import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {BURGER_ROLE_IDS,burgerDossierScope,burgerSubjectCategory,confirmedMemberRoles}
  from '../src/burger-role-policy.js';

const guild='1309532438053130326',now=Date.UTC(2026,9,23,18);
const burgerId='111111111111111111';
const actor={uid:'discord:'+burgerId,discordId:burgerId,
  role:'burger',departments:['burger'],departmentRoles:{burger:'burger'}};
const roles=roleIds=>({guildId:guild,verifiedAt:now-60_000,roleIds});
test('Burger en Burger IO delen bewust dezelfde Burgercategorie; Burgerraad is afzonderlijk',()=>{
  assert.equal(BURGER_ROLE_IDS.council,'1492485336197234728');
  assert.equal(BURGER_ROLE_IDS.member,'1557804276250845185');
  assert.equal(burgerSubjectCategory(roles([BURGER_ROLE_IDS.member]),guild,now),
    'burger');
  assert.equal(burgerSubjectCategory(roles([]),guild,now),null);
  assert.equal(burgerSubjectCategory(roles([BURGER_ROLE_IDS.council]),guild,now),null);
  assert.equal(burgerSubjectCategory(roles([BURGER_ROLE_IDS.member]),'999999999999999999',now),null);
});
test('Burgerraad heeft dienstgebonden beheer, Burger en IO alleen niet',()=>{
  assert.deepEqual(burgerDossierScope(actor,roles([BURGER_ROLE_IDS.member]),guild,now),{
    read:false,write:false,council:false,policeChief:false,boardReadOnly:false});
  const council=burgerDossierScope(actor,roles([BURGER_ROLE_IDS.council]),guild,now);
  assert.equal(council.read,true);assert.equal(council.write,true);
  assert.equal(burgerDossierScope({...actor,uid:'discord:999999999999999999'},
    roles([BURGER_ROLE_IDS.council]),guild,now).read,false);
  assert.equal(confirmedMemberRoles(roles([BURGER_ROLE_IDS.council]),guild,now+16*60000).size,0);
  assert.equal(burgerDossierScope(actor,roles([BURGER_ROLE_IDS.council]),
    guild,now+16*60000).write,false);
});
test('Bestuur leest alleen; goedgekeurde Politie Korpsleiding behoudt schrijfrechten Burger',()=>{
  const board={...actor,boardPersonnelAdmin:true};
  assert.equal(burgerDossierScope(board,roles([]),guild,now).read,true);
  assert.equal(burgerDossierScope(board,roles([]),guild,now).write,false);
  const chief={...actor,role:'korpsleiding',departments:['politie'],
    departmentRoles:{politie:'korpsleiding'}};
  assert.equal(burgerDossierScope(chief,roles([]),guild,now).write,true);
  assert.equal(burgerDossierScope({...chief,boardPersonnelAdmin:true},
    roles([]),guild,now).write,true);
  assert.equal(burgerDossierScope({...chief,departmentRoles:{politie:'middenkader'}},
    roles([]),guild,now).read,false);
  assert.equal(burgerDossierScope({...chief,role:'officierenkader'},
    roles([]),guild,now).read,false);
});
test('Burgerdossier blijft aparte Firestore-sleutel en eigen privacy-api',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/burger-dossier-routes.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/burger-fiche.html',import.meta.url),'utf8');
  const dossier=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
  assert.match(server,/BPD_ENABLE_BURGER_DOSSIERS/);
  assert.match(server,/burgerDossierScope/);
  assert.match(routes,/doc\('burger_'\+id\)/);
  assert.match(routes,/req\.bpd\?\.burgerDossierAccess\?\.read/);
  assert.match(routes,/req\.bpd\?\.burgerDossierAccess\?\.write/);
  assert.match(routes,/burgerSubjectCategory/);
  assert.match(routes,/category:'burger'/);
  assert.doesNotMatch(routes,/burger_onbevestigd/);
  assert.match(dossier,/burger-fiche\.html/);
  assert.match(html,/BPD|Burgerdossier/);
  const src=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src);
  assert.doesNotThrow(()=>new Script(src));
});
