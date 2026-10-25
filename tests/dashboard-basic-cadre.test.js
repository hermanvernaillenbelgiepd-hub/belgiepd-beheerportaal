import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newcomerPortalMode} from '../src/member-dashboard-routes.js';
import {canSeeAdvancedDashboard} from '../src/dashboard-admin-policy.js';

const id='111111111111111111';
const approved=role=>({
 status:'approved',discordId:id,role,
 departments:['politie'],departmentRoles:{politie:role}
});
const police=call=>[{dept:'politie',personId:id,call,
 name:'Voorbeeld',rank:'Inspecteur',status:'Actief'}];

test('Basiskader, incl. vaste 300-reeks, sees personal dashboard, not staff modules',()=>{
 for(const call of ['150','250','300','400','500']){
   assert.equal(newcomerPortalMode(id,approved('basiskader'),police(call)),
     'member',call);
 }
 assert.equal(newcomerPortalMode(id,approved('basiskader'),[]),'member');
 for(const role of ['middenkader','officierenkader','korpsleiding']){
   assert.equal(newcomerPortalMode(id,approved(role),police('350')),'staff',role);
 }
});
test('Role-based fallback for existing legacy/Google sessions is fail-closed',()=>{
 assert.equal(canSeeAdvancedDashboard({role:'basiskader',
  departmentRoles:{politie:'basiskader'}}),false);
 assert.equal(canSeeAdvancedDashboard({role:'agentenkader'}),false);
 assert.equal(canSeeAdvancedDashboard({role:'middenkader',
  departmentRoles:{politie:'middenkader'}}),true);
 assert.equal(canSeeAdvancedDashboard({role:'korpsleiding'}),true);
 assert.equal(canSeeAdvancedDashboard({
  role:'basiskader',departmentRoles:{brandweer:'officierenkader'}}),true,
  'A separately verified higher role retains advanced dashboard');
 assert.equal(canSeeAdvancedDashboard(null),false);
});
test('Personal dashboard contains no links to cadre modules and names Personeelslijst',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const menu=html.match(/<nav id="memberNav"[\s\S]*?<\/nav>/)?.[0];
 const simple=html.match(/<section id="memberDashboard"[\s\S]*?<\/section>/)?.[0];
 assert.ok(menu&&simple);
 for(const block of [menu,simple]){
  for(const forbidden of ['weekrapporten.html','registraties.html','to-dienstbord.html',
    'dossiercentrum.html','gebruikersbeheer.html','rollen-opleidingen.html',
    'personeelsbeheer.html']){
   assert.ok(!block.includes(forbidden),'Forbidden lower-cadre link '+forbidden);
  }
  assert.ok(block.includes('personeelslijst.html'));
  assert.ok(block.includes('vast-roepnummer-aanvragen.html'));
  assert.ok(block.includes('meldingen.html'));
  assert.ok(block.includes('verlofbeheer.html'));
 }
 assert.match(html,/<h2 id="memberRosterTitle">Personeelslijst<\/h2>/);
 assert.ok(html.includes('id="memberCallsignTile"'));
 assert.ok(html.includes('id="memberTrainingTile"'));
 assert.match(html,/Opleiding aanvragen · binnenkort/i);
 assert.ok(html.includes("ctx.showAdvancedDashboard!==true"));
 assert.ok(html.includes("c.request?.assignedCall"));
});
test('My Profile and Notices support personal lower-cadre leave without review rights',()=>{
 const profile=readFileSync(new URL('../public/discord-status.html',import.meta.url),'utf8');
 const notices=readFileSync(new URL('../public/meldingen.html',import.meta.url),'utf8');
 assert.ok(profile.includes('identity.canUseSelfService===true'));
 assert.ok(profile.includes("if(canSeeOwnLeave)loadLeave()"));
 assert.ok(notices.includes('id="personalPanel"'));
 assert.ok(notices.includes("if(!access.canReview)"));
 assert.ok(notices.includes('for(const record of result.mine||[])'));
 assert.ok(notices.includes("root.textContent='Je hebt momenteel geen verlofmeldingen.'"));
});
