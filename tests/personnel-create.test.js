import test from 'node:test';
import assert from 'node:assert/strict';
import {testCreateEnabled,personnelDataEnabled,personnelCreationEnabled,
  STANDARD_ENTRY_RANK,exceptionalPoliceRank,canAuthoriseExceptionalPoliceRank,
  nextPoliceRank,validatePolicePromotion,
  canCreatePersonnel,validateNewPersonnel,
  asCreatedPersonnel,uniqueNewPerson,visiblePendingPersonnel} from '../src/personnel-create.js';

const person={dept:'politie',discordId:'444444444444444444',
  name:'Nieuw Fictief Lid',call:'TEST-P404',rank:'Agent',
  reason:'TEST nieuwe personeelsfiche registreren'};
const actor={role:'officierenkader',departments:['politie','ambulance'],
  departmentRoles:{politie:'officierenkader',ambulance:'middenkader'}};
const env={BPD_TEST_FIXTURES:'true',FIREBASE_PROJECT_ID:'belgiepd-test',
  BPD_ENABLE_PERSONNEL_CREATION:'true'};

test('New personnel creation is never active in production',()=>{
  assert.equal(testCreateEnabled(env),true);
  assert.equal(testCreateEnabled({...env,BPD_TEST_FIXTURES:'false'}),false);
  assert.equal(testCreateEnabled({...env,FIREBASE_PROJECT_ID:'belgiepd-prod'}),false);
  assert.equal(testCreateEnabled({...env,BPD_ENABLE_PERSONNEL_CREATION:'false'}),false);
});
test('MAIN intake has independent explicit enablement and safe read-only pause',()=>{
 const prod={FIREBASE_PROJECT_ID:'belgiepd-production',BPD_TEST_FIXTURES:'false'};
 assert.equal(personnelDataEnabled(prod),false);
 assert.equal(personnelCreationEnabled(prod),false);
 const visible={...prod,BPD_PRODUCTION_PERSONNEL_DATA:'true'};
 assert.equal(personnelDataEnabled(visible),true);
 assert.equal(personnelCreationEnabled(visible),false);
 assert.equal(personnelCreationEnabled({...visible,BPD_PRODUCTION_PERSONNEL_CREATION:'true'}),true);
 assert.equal(personnelDataEnabled({...visible,FIREBASE_PROJECT_ID:'belgiepd-test'}),false);
 assert.equal(personnelCreationEnabled({...visible,BPD_TEST_FIXTURES:'true'}),false);
 assert.equal(personnelDataEnabled({...visible,BPD_TEST_FIXTURES:'true'}),false);
 assert.equal(personnelCreationEnabled({...env,BPD_ENABLE_PERSONNEL_WRITES:'true'}),true);
 assert.equal(personnelCreationEnabled(env),false);
});
test('Validated limited intake cannot inject rank privileges or extra properties',()=>{
  assert.deepEqual(validateNewPersonnel(person),{...person,exceptionalRank:false,exceptionReason:null});
  for(const extra of [{role:'beheerder'},{departmentRoles:{politie:'korpsleiding'}},
    {status:'Actief'},{source:'google-sheets'}]){
    assert.throws(()=>validateNewPersonnel({...person,...extra}));
  }
  assert.throws(()=>validateNewPersonnel({...person,rank:'Commissaris'}));
  assert.throws(()=>validateNewPersonnel({...person,rank:'Inspecteur'}));
  assert.throws(()=>validateNewPersonnel({...person,discordId:'not-an-id'}));
  assert.throws(()=>validateNewPersonnel({...person,reason:'te kort'}));
  assert.throws(()=>validateNewPersonnel({...person,name:'<script>alert(1)</script>'}));
  assert.throws(()=>validateNewPersonnel({...person,call:'TEST-\nX'}));
});
test('Police starts as Agent unless leadership independently authorises and logs an exceptional entry rank',()=>{
  assert.equal(STANDARD_ENTRY_RANK.politie,'Agent');
  assert.equal(exceptionalPoliceRank('Agent','politie'),false);
  assert.equal(exceptionalPoliceRank('Inspecteur','politie'),true);
  assert.equal(exceptionalPoliceRank('Ambulancier','ambulance'),false);
  assert.equal(canAuthoriseExceptionalPoliceRank(actor,'politie'),false);
  const chief={role:'korpsleiding',departments:['politie'],departmentRoles:{politie:'korpsleiding'}};
  const admin={role:'beheerder',departments:['politie'],departmentRoles:{politie:'beheerder'}};
  assert.equal(canAuthoriseExceptionalPoliceRank(chief,'politie'),true);
  assert.equal(canAuthoriseExceptionalPoliceRank(admin,'politie'),true);
  assert.equal(canAuthoriseExceptionalPoliceRank({...chief,departmentRoles:{politie:'officierenkader'}},'politie'),false);
  assert.equal(canAuthoriseExceptionalPoliceRank(admin,'ambulance'),false);
  const upgrade={...person,rank:'Inspecteur',exceptionalRank:true,
    exceptionReason:'Uitzonderlijk instapniveau wegens aantoonbare opleiding en beslissing korpsleiding.'};
  assert.deepEqual(validateNewPersonnel(upgrade),{...upgrade});
  assert.throws(()=>validateNewPersonnel({...upgrade,exceptionalRank:false}));
  assert.throws(()=>validateNewPersonnel({...upgrade,exceptionReason:'te kort'}));
  assert.throws(()=>validateNewPersonnel({...person,exceptionalRank:true}));
  assert.throws(()=>validateNewPersonnel({...person,exceptionReason:'Ongevraagd'}));
});
test('Only high cadre in the subject service can create',()=>{
  assert.equal(canCreatePersonnel(actor,'politie'),true);
  assert.equal(canCreatePersonnel(actor,'ambulance'),false);
  assert.equal(canCreatePersonnel({...actor,role:'middenkader'},'politie'),false);
  assert.equal(canCreatePersonnel({...actor,departments:['ambulance']},'politie'),false);
  assert.equal(canCreatePersonnel({...actor,role:'beheerder'},'politie'),false);
  const admin={role:'beheerder',departments:['politie'],
    departmentRoles:{politie:'beheerder'}};
  assert.equal(canCreatePersonnel(admin,'politie'),true);
  assert.equal(canCreatePersonnel(admin,'ambulance'),false);
});
test('Creation projects a strictly non-privileged personnel record',()=>{
  const record=asCreatedPersonnel({...person,status:'In opleiding'});
  assert.equal(record.personId,person.discordId);
  assert.equal(record.id,'politie:'+person.discordId);
  assert.equal(record.source,'firestore-created');
  assert.equal(record.status,'In opleiding');
  assert.equal(record.rank,'Agent');
  assert.equal(Object.hasOwn(record,'departments'),false);
  assert.equal(Object.hasOwn(record,'role'),false);
  assert.equal(asCreatedPersonnel({...person,status:'Gepromoveerd'}),null);
  assert.equal(asCreatedPersonnel({...person,rank:'Korpschef',status:'Actief'}),null);
});
test('Avoid duplicate Discord IDs and callsign within the same service',()=>{
  const existing=[{dept:'politie',personId:'111111111111111111',call:'TEST-P202'},
    {dept:'ambulance',personId:person.discordId,call:person.call}];
  assert.doesNotThrow(()=>uniqueNewPerson(existing,person));
  assert.throws(()=>uniqueNewPerson([...existing,{dept:'politie',personId:person.discordId,call:'OTHER'}],person));
  assert.throws(()=>uniqueNewPerson(existing,{...person,call:'test-p202'}));
});

test('New personnel can be registered without Discord ID, with no account privileges',()=>{
  const pending=validateNewPersonnel({...person,discordId:''});
  assert.equal(pending.discordId,null);
  assert.equal(pending.dept,'politie');
  assert.equal(asCreatedPersonnel({...pending,status:'In opleiding'}),null);
  assert.doesNotThrow(()=>uniqueNewPerson([],pending));
  const draft=visiblePendingPersonnel('aBcDefGhiJKlmNop1234',{
    ...pending,discordId:null,state:'awaiting_discord'
  });
  assert.equal(draft?.status,'Wacht op Discord-koppeling');
  assert.equal(draft?.internalId,'aBcDefGhiJKlmNop1234');
  assert.equal(Object.hasOwn(draft,'role'),false);
  assert.equal(Object.hasOwn(draft,'discordId'),false);
  assert.equal(visiblePendingPersonnel('bad/ref',{
    ...pending,state:'awaiting_discord'}),null);
  assert.equal(visiblePendingPersonnel('aBcDefGhiJKlmNop1234',{
    ...pending,state:'linked'}),null);
});
test('A missing Discord ID never bypasses the service-specific callsign check',()=>{
  assert.throws(()=>uniqueNewPerson([{dept:'politie',personId:'111111111111111111',call:'TEST-P404'}],
    validateNewPersonnel({...person,discordId:''})));
});

test('Police promotions advance only one grade and require a recorded reason',()=>{
  assert.equal(nextPoliceRank('Agent'),'Aspirant Inspecteur');
  assert.equal(nextPoliceRank('Aspirant Inspecteur'),'Inspecteur');
  assert.equal(nextPoliceRank('Inspecteur'),'Hoofdinspecteur');
  assert.equal(nextPoliceRank('Hoofdinspecteur'),null);
  assert.equal(nextPoliceRank('Niet gekend'),null);
  const change={expectedRank:'Agent',newRank:'Aspirant Inspecteur',
    reason:'Promotie goedgekeurd na controle van opleiding en functioneren.'};
  assert.deepEqual(validatePolicePromotion(change),change);
  assert.throws(()=>validatePolicePromotion({...change,newRank:'Inspecteur'}));
  assert.throws(()=>validatePolicePromotion({...change,reason:'kort'}));
  assert.throws(()=>validatePolicePromotion({...change,discordId:person.discordId}));
  assert.throws(()=>validatePolicePromotion({...change,expectedRank:'Hoofdinspecteur'}));
  assert.equal(asCreatedPersonnel({...person,status:'In opleiding'}).createdInFirestore,true);
});
