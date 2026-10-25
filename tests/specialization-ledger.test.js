import test from 'node:test';
import assert from 'node:assert/strict';
import {Script,runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {SPECIALTY_LABELS,normalizePersonnel} from '../src/normalize.js';
import {canChangeSpecialty,allowedSpecialty,specialtyReadEnabled,specialtyWritesEnabled,
  validateSpecialtyChange,publicSpecializations,applySpecialtyOverlays}
  from '../src/specialization-policy.js';

const a='123456789012345678',b='987654321098765432';
const actor={role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},discordId:a};
const subject={personId:b,dept:'politie',rank:'Inspecteur',specialties:[
  {label:'Radio BM',value:'Nee'},{label:'K9',value:'Stage'},
  {label:'RAGO',value:'Docent'},{label:'Motor',value:'Ja'}]};
const reason='Opleidingsresultaat gecontroleerd door de bevoegde instructeur';
const body={label:'K9',value:'Ja',expectedRevision:0,reason};

test('Catalog exposes all per-service disciplines including SRT and DSU without false source values',()=>{
  const expected=['Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.','K9',
    'RAGO','Dispatch','TO','AE','LRD (Recherche)'];
  assert.deepEqual(SPECIALTY_LABELS.politie,expected);
  assert.equal(allowedSpecialty('politie','K9'),true);
  assert.equal(allowedSpecialty('ambulance','K9'),false);
  assert.equal(allowedSpecialty('politie','Bot ADMIN'),false);
  const sheet=Array.from({length:18},()=>''),header=Array.from({length:18},()=>'');
  sheet[0]='P-101';sheet[2]='Inspecteur';sheet[3]='Inspecteur Test';
  sheet[4]='2';sheet[5]='Actief';sheet[11]='Nee';sheet[17]=b;
  const staff=normalizePersonnel('politie',[header,sheet]);
  assert.equal(staff.length,1);
  assert.equal(staff[0].specialties.some(x=>['SRT','DSU'].includes(x.label)),false);
});
test('Only officers/leadership with service scope and subordinate may change status',()=>{
  assert.equal(canChangeSpecialty(actor,subject),true);
  assert.equal(canChangeSpecialty({...actor,role:'beheerder',
    departmentRoles:{politie:'beheerder'}},subject),false);
  assert.equal(canChangeSpecialty({...actor,role:'beheerder',
    departmentRoles:{politie:'korpsleiding'}},subject),false);
  assert.equal(canChangeSpecialty({...actor,
    departmentRoles:{politie:'middenkader'}},subject),false);
  assert.equal(canChangeSpecialty({...actor,
    departmentRoles:{politie:'officierenkader',ambulance:'officierenkader'},
    departments:['politie','ambulance']},
    {...subject,dept:'ambulance'}),false);
  assert.equal(canChangeSpecialty({...actor,role:'middenkader',departmentRoles:{politie:'middenkader'}},subject),false);
  assert.equal(canChangeSpecialty({...actor,discordId:b},subject),false);
  assert.equal(canChangeSpecialty({...actor,departments:['ambulance']},subject),false);
  assert.equal(canChangeSpecialty(actor,{...subject,rank:'Commissaris'}),false);
  assert.equal(canChangeSpecialty({...actor,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'}},
    {...subject,rank:'Hoofdinspecteur'}),true);
});
test('Write flags are opt-in separately from readable states',()=>{
  assert.equal(specialtyReadEnabled({}),false);
  assert.equal(specialtyWritesEnabled({BPD_ENABLE_PERSONNEL_SPECIALTY_WRITES:'true'}),false);
  assert.equal(specialtyWritesEnabled({BPD_ENABLE_PERSONNEL_SPECIALTIES:'true'}),false);
  assert.equal(specialtyWritesEnabled({BPD_ENABLE_PERSONNEL_SPECIALTIES:'true',
    BPD_ENABLE_PERSONNEL_SPECIALTY_WRITES:'true'}),true);
});
test('Only known states, exact labels, concurrency revision and reason accepted',()=>{
  assert.deepEqual(validateSpecialtyChange(body,'politie'),body);
  for(const value of ['Nee','Stage','Ja','Docent','Niet ingevuld'])
    assert.equal(validateSpecialtyChange({...body,value},'politie').value,value);
  for(const bad of [{...body,expectedRevision:-1},{...body,value:'Admin'},
    {...body,label:'Rang'},{...body,reason:'te kort'},
    {...body,role:'beheerder'},{...body,expectedRevision:1.5}]){
    assert.throws(()=>validateSpecialtyChange(bad,'politie'));
  }
});
test('Overlay leaves Sheets intact and makes manual changes visible in main roster',()=>{
  const doc={dept:'politie',discordId:b,revision:1,values:{
    K9:{value:'Ja',source:'manual'},'Radio BM':{value:'Nee',source:'manual'}
  }};
  const merged=applySpecialtyOverlays([subject],[doc]);
  assert.equal(subject.specialties.find(x=>x.label==='K9').value,'Stage');
  assert.equal(merged[0].specialties.find(x=>x.label==='K9').value,'Ja');
  assert.equal(merged[0].specialties.find(x=>x.label==='RAGO').value,'Docent');
  assert.equal(merged[0].specialties.some(x=>['SRT','DSU'].includes(x.label)),false);
  const publicState=publicSpecializations(subject,doc);
  assert.equal(publicState.revision,1);
  assert.equal(publicState.items.find(x=>x.label==='K9').source,'manual');
  assert.equal(publicState.items.find(x=>x.label==='Motor').source,'google-sheets');
});
test('Browser headings show pictograms and aligned statuses, including negative and trainee statuses',()=>{
  const path=new URL('../public/personnel-list-visuals.js',import.meta.url);
  const context={window:{}};runInNewContext(readFileSync(path,'utf8'),context);
  const ui=context.window.BPDPersonnelVisuals;
  assert.equal(ui.specialtyColumns('politie').length,10);
  assert.equal(ui.specialtyColumns('ambulance').length,5);
  assert.equal(ui.specialtyColumns('all').length,0);
  assert.deepEqual([...ui.specialtyColumns('politie')],
    SPECIALTY_LABELS.politie.filter(label=>label!=='LRD (Recherche)'));
  const states=ui.specialtyStatuses(subject.specialties);
  assert.equal(states.find(x=>x.label==='K9').style,'stage');
  assert.equal(states.find(x=>x.label==='Radio BM').style,'no');
  assert.equal(states.find(x=>x.label==='RAGO').style,'teacher');
  assert.equal(ui.specialtyIcon('RAGO'),'🚁');
  assert.equal(ui.specialtyIcon('Radio BM'),'📻');
  assert.equal(ui.specialtyColumns('politie').includes('SRT'),false);
  assert.equal(ui.specialtyColumns('politie').includes('DSU'),false);
  const homepage=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.ok(homepage.includes('href="/personeelsbeheer.html"'));
  assert.equal(homepage.includes('specialtyStateFor('),false,
    'The redesigned home page does not expose protected personnel data');
  const manager=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  assert.ok(manager.includes('specialtyStateFor('));
  assert.ok(manager.includes('specialtyColumns('));
  assert.equal(manager.includes('roster-attribution'),false);
  for(const match of manager.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g))
    assert.doesNotThrow(()=>new Script(match[1].replace(/^import [^\n]*\n/gm,'')));
});
test('Server synchronizes per-person overlay only when enabled and keeps all writes audit protected',()=>{
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/specialization-routes.js',import.meta.url),'utf8');
  assert.ok(server.includes('applySpecialtyOverlays(personnel,specialties.docs)'));
  assert.ok(server.includes('installSpecializationRoutes(app,{requireUser:requireDossierUser,getSnapshot});'));
  assert.ok(routes.includes('canChangeSpecialty(req.bpd,staff)'));
  assert.ok(routes.includes('validateSpecialtyChange(req.body,req.params.dept)'));
  assert.ok(routes.includes('tx.create(ref.collection(\'audit\').doc()'));
  assert.ok(routes.includes('revision:current+1'));
  assert.ok(routes.includes('discordRoleChanged:false'));
});
