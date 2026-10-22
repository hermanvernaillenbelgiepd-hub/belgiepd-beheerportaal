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
    'RAGO','Dispatch','TO','AE'];
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
  assert.deepEqual([...ui.specialtyColumns('politie')],SPECIALTY_LABELS.politie);
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


test('Multiple specialization changes validate distinct labels, shared reason and one revision',async()=>{
 const {validateSpecialtyBatch,canSetSpecialtyValue}=await import('../src/specialization-policy.js');
 const x=validateSpecialtyBatch({changes:[{label:'Radio BM',value:'Ja'},{label:'SIV/WPR',value:'Nee'}],
   reason,expectedRevision:4},'politie');
 assert.equal(x.changes.length,2);assert.equal(x.expectedRevision,4);
 assert.throws(()=>validateSpecialtyBatch({...x,changes:[x.changes[0],x.changes[0]]},'politie'),/Dubbele/);
 assert.throws(()=>validateSpecialtyBatch({...x,changes:[{label:'Motor',value:'Te volgen'}]},'politie'),/Te volgen/);
 assert.throws(()=>validateSpecialtyBatch({...x,changes:[]},'politie'),/Kies/);
 assert.throws(()=>validateSpecialtyBatch({...x,changes:[{label:'Radio BM',value:'Ja',extra:'x'}]},'politie'),/Ongeldige/);
 const mid={role:'middenkader',departments:['politie'],
    departmentRoles:{politie:'middenkader'},discordId:a,dossierNativeDepartments:['politie']};
 const junior={...subject,rank:'Inspecteur (INP)'};
 assert.equal(canSetSpecialtyValue(mid,junior,'Radio BM','Te volgen'),true);
 for(const [label,value] of [['Radio BM','Ja'],['SIV/WPR','Te volgen'],['Motor','Te volgen']])
   assert.equal(canSetSpecialtyValue(mid,junior,label,value),false);
 assert.equal(canSetSpecialtyValue(mid,{...junior,rank:'Hoofdinspecteur (HINP)'},'Radio BM','Te volgen'),false);
 assert.equal(canSetSpecialtyValue(mid,{...junior,dept:'brandweer'},'Radio BM','Te volgen'),false);
 assert.equal(canSetSpecialtyValue({...mid,discordId:b},junior,'Radio BM','Te volgen'),false);
});
test('Te volgen is not considered a completed qualification, but appears as an orange status',async()=>{
 const ctx={window:{}};runInNewContext(readFileSync(new URL('../public/personnel-list-visuals.js',import.meta.url),'utf8'),ctx);
 const x=ctx.window.BPDPersonnelVisuals;
 assert.equal(x.specialtyStatuses([{label:'Radio BM',value:'Te volgen'}])[0].style,'follow');
 assert.equal(x.qualification('Te volgen'),false);
 const {applySpecialtyOverlays}=await import('../src/specialization-policy.js');
 const result=applySpecialtyOverlays([subject],[{dept:'politie',discordId:b,
  revision:3,values:{'Radio BM':{value:'Te volgen',source:'manual'}}}]);
 assert.equal(result[0].specialties.find(z=>z.label==='Radio BM').value,'Te volgen');
 assert.equal(result[0].special.includes('Te volgen'),false);
});
test('Approved fixed 200–299 callsigns seed only RADIO BM and SIV/WPR after sync',async()=>{
 const {initialFixedCallSpecialties}=await import('../src/specialization-policy.js');
 const verified={status:'approved',discordId:b,assignedCall:205,
  sync:{call:205,discordId:b}};
 const result=initialFixedCallSpecialties(verified);
 assert.deepEqual(Object.keys(result),['Radio BM','SIV/WPR']);
 assert.equal(result['Radio BM'].value,'Ja');
 for(const bad of [{...verified,assignedCall:199},{...verified,assignedCall:300},
  {...verified,status:'verified'},{...verified,sync:null},
  {...verified,sync:{call:206,discordId:b}}])
  assert.equal(initialFixedCallSpecialties(bad),null);
 const routes=readFileSync(new URL('../src/callsign-routes.js',import.meta.url),'utf8');
 assert.ok(routes.includes('const specialtyCurrent=await specialtyRef.get()'));
 assert.ok(routes.includes('if(defaults&&!specialtyCurrent.exists)'));
 assert.ok(routes.includes('batch.create(specialtyRef,'));
 assert.ok(routes.includes("action:'initial_fixed_callsign_specialty'"));
});
test('Specialization batch writes one audit and a live report entry per change, cadre notifications are guarded',()=>{
 const source=readFileSync(new URL('../src/specialization-routes.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const notifications=readFileSync(new URL('../public/meldingen.html',import.meta.url),'utf8');
 assert.ok(source.includes("validateSpecialtyBatch(req.body,req.params.dept)"));
 assert.ok(source.includes("for(const change of proposal.changes){"));
 assert.ok(source.includes("tx.create(ref.collection('audit').doc()"));
 assert.ok(source.includes("collection('bpd_cases').doc(staff.dept+'_'+staff.personId)"));
 assert.ok(source.includes("type:'specialization_changed'"));
 assert.ok(source.includes("if(!highPoliceCadre(req.bpd))"));
 assert.ok(ui.includes('id="specialtyBulkRows"'));
 assert.ok(ui.includes('body:{changes,reason:'));
 assert.ok(notifications.includes('id="cadreChanges"'));
 assert.ok(notifications.includes("api('/api/personnel/specialization-notifications')"));
});
