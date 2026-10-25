import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {basicCallLevel,basicAuthor,basicEligibleTarget,
  basicObservationTargets,mayReadBasicInbox} from '../src/basic-observation-policy.js';
import {canReadServiceDossier} from '../src/service-dossier-access.js';

const ranks=[
  {call:'S150',rank:'Agent van politie'},
  {call:'S258',rank:'Agent van Politie'},
  {call:'S302',rank:'Aspirant Inspecteur van Politie'},
  {call:'S485',rank:'Inspecteur van Politie'},
  {call:'S540',rank:'Eerste Inspecteur van Politie'},
  {call:'S650',rank:'Aspirant Hoofdinspecteur van Politie'},
  {call:'S750',rank:'Hoofdinspecteur van Politie'},
  {call:'S950',rank:'Commissaris'}
].map((person,i)=>({...person,dept:'politie',personId:String(i+1).repeat(18),name:'Demo '+i}));
const actorFor=(index,role='basiskader')=>({
  role,discordId:ranks[index].personId,departments:['politie'],
  departmentRoles:{politie:role},dossierAllowedDepartments:['politie']
});
test('1xx en 2xx hebben gelijke Agent-graad; de Basiskader-reeksen zijn 3xx–5xx',()=>{
  assert.deepEqual(ranks.map(basicCallLevel),[0,0,1,2,3,null,null,null]);
  assert.equal(basicAuthor(actorFor(0),ranks[0]),false);
  assert.equal(basicAuthor(actorFor(2),ranks[2]),true);
  assert.equal(basicAuthor(actorFor(3),ranks[3]),true);
  assert.equal(basicAuthor(actorFor(4),ranks[4]),true);
  assert.equal(basicAuthor(actorFor(5),ranks[5]),false);
});
test('Aspirant Inspecteur 3xx kan alleen Agenten 1xx en 2xx observeren',()=>{
  const data=basicObservationTargets(actorFor(2),ranks);
  assert.equal(data.targets.length,2);
  assert.deepEqual(data.targets.map(x=>x.call),['S150','S258']);
  assert.equal(basicEligibleTarget(ranks[2],ranks[2]),false);
});
test('INP 4xx kan ook A-INP 3xx observeren, niet eigen rang of hoger',()=>{
  assert.deepEqual(basicObservationTargets(actorFor(3),ranks).targets.map(x=>x.call),
    ['S150','S258','S302']);
});
test('1-INP 5xx mag tot en met 4xx observeren, geen middenkader of officieren',()=>{
  assert.deepEqual(basicObservationTargets(actorFor(4),ranks).targets.map(x=>x.call),
    ['S150','S258','S302','S485']);
  assert.equal(basicEligibleTarget(ranks[4],ranks[5]),false);
});
test('Concrete examples: rank level 500 > 400 > 300, not the exact callsign',()=>{
 let seq=0;
 const make=(call,rank)=>({call:String(call),rank,
   dept:'politie',personId:String(++seq).padStart(18,'1')});
 const ainp='Aspirant Inspecteur van Politie';
 const inp='Inspecteur van Politie';
 const first='Eerste Inspecteur van Politie';
 for(const [a,b,allowed] of [
   [make(501,first),make(438,inp),true],
   [make(450,inp),make(328,ainp),true],
   [make(320,ainp),make(380,ainp),false],
   [make(320,ainp),make(310,ainp),false],
   [make(501,first),make(599,first),false],
   [make(450,inp),make(400,inp),false],
   [make(320,ainp),make(450,inp),false],
   [make(500,first),make(400,inp),true]
 ])assert.equal(basicEligibleTarget(a,b),allowed,a.call+' naar '+b.call);
});

test('Basiskader kan ook met toevallig extra dossiergrant geen observaties lezen',()=>{
 const basic={...actorFor(3),dossierAllowedDepartments:['politie'],
   dossierFullDepartments:['politie'],dossierManageDepartments:['politie']};
 assert.equal(basicAuthor(basic,ranks[3]),true);
 assert.equal(basicObservationTargets(basic,ranks).targets.length,3);
 assert.equal(mayReadBasicInbox(basic),false);
 assert.equal(canReadServiceDossier(basic,'politie'),false,
   'Een extra dossiergrant is nooit een bypass voor Basiskader-observaties');
 for(const role of ['middenkader','officierenkader','korpsleiding']){
   const leader={...basic,role,departmentRoles:{politie:role}};
   assert.equal(canReadServiceDossier(leader,'politie'),true);
   assert.equal(mayReadBasicInbox(leader),true);
 }
 const board={...basic,boardPersonnelAdmin:true};
 assert.equal(canReadServiceDossier(board,'politie'),true,
   'Geverifieerd Bestuur is een afzonderlijke rol met eigen privileges');
});

test('Dubbele personeelsidentiteiten en rollen buiten Basiskader hebben geen schrijfbevoegdheid',()=>{
  assert.equal(basicObservationTargets(actorFor(3),[...ranks,ranks[3]]).targets.length,0);
  assert.equal(basicObservationTargets(actorFor(3,'middenkader'),ranks).targets.length,0);
  assert.equal(basicObservationTargets(actorFor(3),ranks.filter(x=>x!==ranks[3])).targets.length,0);
});
test('Gebundelde inbox is alleen voor kaderleden en geverifieerd Bestuur',()=>{
  const actor=role=>({...actorFor(3,role),dossierNativeDepartments:['politie']});
  assert.equal(mayReadBasicInbox(actor('basiskader')),false);
  assert.equal(mayReadBasicInbox(actor('middenkader')),true);
  assert.equal(mayReadBasicInbox(actor('officierenkader')),true);
  assert.equal(mayReadBasicInbox(actor('korpsleiding')),true);
  assert.equal(mayReadBasicInbox({...actor('basiskader'),boardPersonnelAdmin:true}),true);
  assert.equal(mayReadBasicInbox({...actor('officierenkader'),departments:['brandweer']}),false);
});
test('Beveiligde routes weigeren sancties en gebruiken bestaande persoonsdossiers plus meldingen',()=>{
  const route=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');
  const legacy=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
  assert.match(route,/basicObservationTargets\(req\.bpd,roster\)/);
  assert.match(route,/validateEntry\(\{\.\.\.body,type:'observatie'\}\)/);
  assert.match(route,/bpd_cases/);
  assert.match(route,/bpd_notices/);
  assert.match(route,/mayReadBasicInbox\(req\.bpd\)/);
  assert.match(legacy,/basicObservationTargets\(req\.bpd,snap\.data\)/);
  assert.ok(!page.includes('id="sanctionType"'));
  assert.ok(page.includes('Observaties vanuit Basiskader'));
});
