import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFileSync} from 'node:fs';
import {mayWriteManagement,MANAGEMENT_TYPES} from '../src/management-utils.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/personeelsbeheer.html');
const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const staff=read('src/staff-dossier-routes.js');
const routes=read('src/management-routes.js');
const officer={uid:'discord:123456789012345678',discordId:'123456789012345678',
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},
  dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};

function menu({dept='politie',types=null,formal=true,training=true,leave=true}={}){
  const begin=inline.indexOf('function canRegisterOfficialTraining(){');
  const end=inline.indexOf('function displaySelectedRegistration()',begin);
  assert.ok(begin>0&&end>begin);
  const code=inline.slice(begin,end)+'\n({availablePersonnelRegistrationKinds})';
  const actor={name:'Eigen account',discordId:officer.discordId};
  const rights=types??MANAGEMENT_TYPES.filter(t=>mayWriteManagement(officer,dept,t));
  const context={
    selected:{dept},
    casePermissions:{writesEnabled:true,actor,typesByDepartment:{[dept]:rights}},
    formalPermissions:formal?{writesEnabled:true,actor,
      observationDepartments:[dept],sanctionDepartments:[dept],
      sanctionOptionsByDepartment:{[dept]:['Mondelinge waarschuwing']}}:null,
    trainingRights:training?{trainingWritesEnabled:true,
      permissions:{[dept]:{'training.log':true}}}:null,
    registrationManualLeave:leave,
    staffCaseLabels:{
      notitie:'Belangrijke notitie',algemene_notitie:'Algemene notitie',
      activiteit:'Dienstactiviteit',inactiviteitsping:'Activiteitenping',
      specialisatiebeperking:'Beperking van specialisatie',
      personeelsbeweging:'Personeelsbeweging',promotievoorstel:'Promotievoorstel',
      voordracht_ereteken:'Voordracht ereteken',naamswijziging:'Naamswijziging'
    }
  };
  return new Script(code).runInNewContext(context).availablePersonnelRegistrationKinds()
    .map(([key])=>key);
}

test('politie Officierenkader ziet alle bevoegde bestaande dossierregistraties',()=>{
  const wanted=['observatie','sanctie','training','leave',
    'case:notitie','case:algemene_notitie','case:inactiviteitsping',
    'case:activiteit','case:specialisatiebeperking','case:promotievoorstel',
    'case:naamswijziging','case:personeelsbeweging','case:voordracht_ereteken'];
  const choices=menu();
  for(const key of wanted)assert.ok(choices.includes(key),'Ontbreekt: '+key);
  assert.ok(!choices.includes('case:opleiding'),'geen dubbele opleidingregistratie');
  assert.ok(!choices.includes('case:verlof'),'centraal verlof blijft enige route');
});
test('politie Middenkader heeft notities en ping, geen hogere-kaderacties',()=>{
  const mid={...officer,role:'middenkader',
    departmentRoles:{politie:'middenkader'}};
  const types=MANAGEMENT_TYPES.filter(t=>mayWriteManagement(mid,'politie',t));
  const kinds=menu({types,formal:false,training:false,leave:false});
  for(const key of ['case:notitie','case:algemene_notitie',
    'case:activiteit','case:inactiviteitsping'])
    assert.ok(kinds.includes(key),key);
  for(const key of ['case:promotievoorstel','case:naamswijziging',
    'case:personeelsbeweging','case:voordracht_ereteken'])
    assert.ok(!kinds.includes(key),key);
});
test('de andere hulpdiensten krijgen geen extra operationele rechten uit het menu',()=>{
  const kinds=menu({dept:'depannage',
    types:['algemene_notitie','specialisatiebeperking','activiteit','personeelsbeweging'],
    formal:true,training:true,leave:true});
  assert.deepEqual(kinds,['observatie','sanctie',
    'case:specialisatiebeperking','case:algemene_notitie']);
});
test('beveiligde kaderendpoint wordt onafhankelijk geladen en fouten blijven zichtbaar',()=>{
  assert.match(inline,/async function loadStaffCasePermissions\(person,key,canManage\)/);
  const fn=inline.slice(inline.indexOf('async function loadStaffCasePermissions('),
    inline.indexOf('let trainingRights=',inline.indexOf('async function loadStaffCasePermissions(')));
  assert.match(fn,/await request\('\/api\/management\/overview'\)/);
  assert.doesNotMatch(fn,/if\(!canManage\)return/);
  assert.match(inline,/Overige dossiercategorieën:/);
  assert.match(staff,/\.some\(type=>mayWriteManagement\(req\.bpd,staff\.dept,type\)\)/);
  // Every server POST continues to enforce actual authorization.
  assert.match(routes,/!mayWriteManagement\(req\.bpd,dept,type\)/);
  assert.match(routes,/const actor=reportAuditActor\(req,snap\.data\)/);
});
