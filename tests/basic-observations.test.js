import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {basicCallLevel,basicAuthor,basicEligibleTarget,
  basicObservationTargets,mayReadBasicInbox,basicObservationDenial,
  basicObservationWritesEnabled} from '../src/basic-observation-policy.js';
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
test('Beveiligde routes weigeren sancties en gebruiken een afzonderlijk register',()=>{
  const route=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');
  const legacy=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
  assert.match(route,/basicObservationTargets\(req\.bpd,roster\)/);
  assert.match(route,/validateEntry\(\{\.\.\.body,type:'observatie'\}\)/);
  assert.match(route,/collection\('bpd_basic_observations'\)/);
  assert.match(route,/Strictly separate from bpd_cases/);
  assert.doesNotMatch(route,/collection\('bpd_cases'\)/);
  assert.doesNotMatch(route,/collection\('bpd_notices'\)/);
  assert.match(route,/basicCallLevel\(\{dept:POL,call:author\?\.call\}\)/);
  assert.match(route,/mayReadBasicInbox\(req\.bpd\)/);
  assert.match(legacy,/basicObservationTargets\(req\.bpd,snap\.data\)/);
  assert.ok(!page.includes('id="sanctionType"'));
  assert.ok(page.includes('Observaties vanuit Basiskader'));
});

test('Agentenkader krijgt ook bij foutieve dossiergrant geen politiedossiers',()=>{
 const agent={...actorFor(0,'agentenkader'),
   dossierNativeDepartments:['politie'],dossierFullDepartments:['politie']};
 assert.equal(canReadServiceDossier(agent,'politie'),false);
 assert.equal(mayReadBasicInbox(agent),false);
 assert.equal(basicObservationTargets(agent,ranks).targets.length,0);
 const technical={...agent,portalTechnicalMode:true,profileTechnicalAvailable:true,
   uid:'discord:'+agent.discordId};
 assert.equal(canReadServiceDossier(technical,'politie'),true);
 const board={...agent,boardPersonnelAdmin:true};
 assert.equal(canReadServiceDossier(board,'politie'),true);
});


test('Arixx 432: Basiskader kan 1xx/2xx/3xx observeren, niet 4xx of hoger',()=>{
 const me={dept:'politie',personId:'432432432432432432',
   name:'Arixx',call:'SANTO-432',rank:'Inspecteur van Politie'};
 const lower=[
   {dept:'politie',personId:'111111111111111111',call:'SANTO 123',rank:'Agent van Politie'},
   {dept:'politie',personId:'222222222222222222',call:'205',rank:'Agent van Politie'},
   {dept:'politie',personId:'333333333333333333',call:'S 303',rank:'Aspirant Inspecteur'}
 ];
 const peers=[
   {dept:'politie',personId:'444444444444444444',call:'401',rank:'Inspecteur'},
   {dept:'politie',personId:'555555555555555555',call:'501',rank:'Eerste Inspecteur'}
 ];
 const actor={role:'middenkader',discordId:me.personId,
   departments:['brandweer','politie'],departmentRoles:{brandweer:'middenkader',politie:'basiskader'}};
 assert.equal(basicCallLevel(me),2);
 assert.equal(basicCallLevel({...me,call:'432'}),2);
 assert.equal(basicCallLevel({...me,call:'S432'}),2);
 const access=basicObservationTargets(actor,[me,...lower,...peers]);
 assert.equal(access.author?.personId,me.personId);
 assert.deepEqual(access.targets.map(p=>p.personId),lower.map(p=>p.personId));
 assert.equal(basicObservationDenial(actor,[me,...lower,...peers]),null);
});
test('Geverifieerde politierol, ondubbelzinnige identiteit en foutmelding blijven verplicht',()=>{
 const id='432432432432432432';
 const p={dept:'politie',personId:id,call:'432',rank:'Inspecteur',name:'Arixx'};
 const actor={role:'middenkader',discordId:id,departments:['politie','brandweer'],
   departmentRoles:{politie:'basiskader',brandweer:'middenkader'}};
 assert.match(basicObservationDenial(actor,[]),/niet eenduidig/);
 assert.match(basicObservationDenial(actor,[p,p]),/niet eenduidig/);
 assert.match(basicObservationDenial({...actor,departmentRoles:{politie:'middenkader'}},[p]),/Basiskaderrol/);
 assert.match(basicObservationDenial(actor,[{...p,call:'onbekend'}]),/roepnummer/);
 assert.equal(basicAuthor({...actor,departments:['brandweer']},p),false);
});
test('Afzonderlijke Basiskader-opslag kan werken zonder brede registratiemodule',()=>{
 assert.equal(basicObservationWritesEnabled({BPD_ENABLE_REGISTRATIONS:'false'}),true);
 assert.equal(basicObservationWritesEnabled({BPD_ENABLE_BASIC_OBSERVATIONS:'false'}),false);
 assert.equal(basicObservationWritesEnabled({BPD_ENABLE_BASIC_OBSERVATIONS:'true'}),true);
 const route=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');
 const safe=readFileSync(new URL('../src/registrations.js',import.meta.url),'utf8');
 const nav=readFileSync(new URL('../public/bpd-navigation.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
 assert.match(route,/basicObservationWritesEnabled\(process.env\)/);
 assert.match(route,/basicObservationDenial\(req\.bpd,roster\)/);
 assert.match(safe,/roleForDepartment\(user,'politie'\)==='basiskader'/);
 assert.match(nav,/basicObservationCanSubmit===true/);
 assert.match(server,/basicObservationTargets\(req\.bpd,roster\)/);
 assert.match(page,/accessReason'\)\.textContent=data\.explanation/);
});

test('Multi-service leiding behoudt politie-Basiskader inzendknop zonder inboxrechten',()=>{
 const member=ranks[3];
 for(const service of ['brandweer','ambulance','depannage']){
   const actor={...actorFor(3),role:'korpsleiding',
     departments:[service,'politie'],
     departmentRoles:{[service]:'korpsleiding',politie:'basiskader'},
     dossierNativeDepartments:[service],dossierAllowedDepartments:[service]};
   assert.equal(basicObservationTargets(actor,ranks).author?.personId,member.personId);
   assert.equal(basicObservationTargets(actor,ranks).targets.length,3);
   assert.equal(mayReadBasicInbox(actor),false,
     'Leiding buiten politie geeft nooit inzage in politie-Basiskader inbox');
 }
});
test('Politie Middenkader met leiding in andere dienst kan ontvangstoverzicht openen',()=>{
 const actor={...actorFor(5),role:'korpsleiding',
  departments:['brandweer','politie'],
  departmentRoles:{brandweer:'korpsleiding',politie:'middenkader'},
  dossierNativeDepartments:['politie','brandweer'],
  dossierAllowedDepartments:['politie','brandweer']};
 assert.equal(mayReadBasicInbox(actor),true);
 assert.equal(basicObservationTargets(actor,ranks).author,null);
 assert.equal(mayReadBasicInbox({...actor,departmentRoles:{politie:'basiskader'}}),false);
});
test('Observaties Basiskader in Brandweer- en AZLS-menu zijn alleen zichtbaar na politiecontrole',()=>{
 const nav=readFileSync(new URL('../public/bpd-navigation.js',import.meta.url),'utf8');
 const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');
 assert.match(nav,/if\(policeObservations\)pages\.push\('observations'\)/);
 assert.match(nav,/context\?\.basicObservationCanReview===true/);
 for(const name of ['zoneNavObservations','ambulanceNavObservations',
   'memberNavObservations','staffNavObservations'])assert.match(home,new RegExp('id="'+name+'"'));
 assert.match(home,/showObservationNavigation\(ctx\)/);
 assert.match(home,/basicObservationCanReview===true/);
 assert.match(server,/req\.bpd\.basicObservationCanReview=mayReadBasicInbox\(req\.bpd\)/);
 assert.match(server,/basicObservationCanReview:req\.bpd\.basicObservationCanReview===true/);
 assert.match(route,/basicCallLevel\(\{dept:POL,call:author\?\.call\}\)/);
 assert.doesNotMatch(route,/replace\(\/\^S\[- \]\?\/i/);
});


test('Arixx 432 met Brandweerleiding en politierol op Discord kan observaties indienen',()=>{
 const id=ranks[3].personId;
 const officer={uid:'discord:'+id,discordId:id,role:'korpsleiding',
  departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'},
  discordPoliceRank:'basiskader'};
 const access=basicObservationTargets(officer,ranks);
 assert.equal(access.author?.personId,id);
 assert.deepEqual(access.targets.map(p=>p.call),['S150','S258','S302']);
 assert.equal(basicObservationDenial(officer,ranks),null);
 assert.equal(mayReadBasicInbox(officer),false,
  'Verificatie van Basiskader geeft nooit toegang tot de ontvangen observaties');
});
test('Een rol, roepnummer of andere dienst alleen geeft geen Politie-Basiskaderrechten',()=>{
 const id=ranks[3].personId;
 const actor={uid:'discord:'+id,discordId:id,role:'korpsleiding',
  departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'},
  discordPoliceRank:'basiskader'};
 assert.equal(basicAuthor({...actor,uid:'discord:555555555555555555'},ranks[3]),false);
 assert.equal(basicAuthor({...actor,discordPoliceRank:null},ranks[3]),false);
 assert.equal(basicAuthor({...actor,discordPoliceRank:'middenkader'},ranks[3]),false);
 assert.equal(basicAuthor({...actor,portalTechnicalMode:true},ranks[3]),false);
 assert.equal(basicAuthor({...actor,departments:['brandweer','politie'],
  departmentRoles:{brandweer:'korpsleiding',politie:'officierenkader'}},ranks[3]),false);
 assert.equal(basicObservationTargets(actor,ranks.filter(p=>p!==ranks[3])).author,null);
 assert.equal(basicObservationTargets(actor,[...ranks,ranks[3]]).author,null);
});
test('Registratie gebruikt de geverifieerde Politiefiche als auteur, niet de primaire Brandweerfunctie',()=>{
 const route=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');
 assert.match(route,/const policePerson=access\.author/);
 assert.match(route,/discordId:policePerson\.personId/);
 assert.match(route,/rank:policePerson\.rank,dept:POL/);
 assert.doesNotMatch(route,/const author=actorFromPersonnel\(req\.bpd,roster\)/);
 const policy=readFileSync(new URL('../src/basic-observation-policy.js',import.meta.url),'utf8');
 assert.match(policy,/verifiedBasicPoliceIdentity\(actor\)/);
 assert.match(policy,/uid==='discord:'\+actor\.discordId/);
});
