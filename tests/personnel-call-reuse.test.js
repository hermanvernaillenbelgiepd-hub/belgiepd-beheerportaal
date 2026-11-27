import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeCallPersonnel,sameServiceCall,callReservationRefs,archivedOwnerProof,
 inspectCallReservation,assignCallReservation,prepareCallRelease,releasePreparedCallClaims}
 from '../src/personnel-call-ownership.js';
import {callHeldByArchivedMember,readPoliceCallOccupation}
 from '../src/police-call-availability.js';
import {overlayPersonnelLifecycle,lifecycleSourceSnapshot,
 validateLifecycleAction} from '../src/personnel-lifecycle-policy.js';
const OLD='111111111111111111',NEW='222222222222222222';
const original={dept:'politie',personId:OLD,name:'Oude agent',call:'200',
  rank:'Agent',status:'Actief'};
const prior={dept:'politie',discordId:OLD,state:'archived',revision:1,
  snapshot:lifecycleSourceSnapshot(original)};
const db={
 collection(name){
  return {
   doc(id){return {id,path:name+'/'+id}},
   where(){return {get:async()=>({docs:[]})}},
   get:async()=>({docs:[]})
  };
 }
};
function mockDoc(ref,data){
 return {...ref,ref,exists:data!==undefined,
   get(key){return data?.[key]},
   data(){return data}};
}
function mockTx(documents){
 const writes=[];
 return {
  writes,
  async get(ref){return mockDoc(ref,documents.get(ref.path))},
  set(ref,data){writes.push({op:'set',path:ref.path,data})},
  create(ref,data){writes.push({op:'create',path:ref.path,data})},
  delete(ref){writes.push({op:'delete',path:ref.path})}
 };
}

test('An archived roster member has no active number but keeps their historical CALL',()=>{
 const past=overlayPersonnelLifecycle([original],[{...prior,id:'politie_'+OLD}],
  {includeArchived:true});
 assert.equal(past.length,1);
 assert.equal(past[0].call,'200');
 assert.equal(past[0].lifecycleState,'archived');
 assert.deepEqual(activeCallPersonnel(past),[]);
 assert.equal(overlayPersonnelLifecycle([original],[{...prior,id:'politie_'+OLD}]).length,0);
 assert.equal(sameServiceCall('politie','S-200','200'),true);
 assert.equal(sameServiceCall('politie','S 200','200'),true);
 assert.equal(sameServiceCall('politie','201','200'),false);
 assert.equal(sameServiceCall('brandweer','OOF12','oof12'),true);
});

test('Only the exact archived owner can release an older persisted lock',()=>{
 const claim=mockDoc({id:'legacy',path:'bpd_personnel_call_claims/legacy'},
   {dept:'politie',discordId:OLD,call:'S-200'});
 const archive=mockDoc({id:'politie_'+OLD,path:'bpd_personnel_lifecycle/politie_'+OLD},prior);
 assert.equal(archivedOwnerProof(claim,archive,'politie','200'),true);
 assert.equal(archivedOwnerProof(claim,
   mockDoc(archive,{...prior,state:'active'}),'politie','200'),false);
 assert.equal(archivedOwnerProof(claim,
   mockDoc(archive,{...prior,snapshot:{...prior.snapshot,call:'201'}}),
   'politie','200'),false);
 assert.equal(archivedOwnerProof(mockDoc(claim,{discordId:null,call:'200'}),
   archive,'politie','200'),false);
 assert.equal(archivedOwnerProof(claim,archive,'brandweer','200'),false);
});

test('A new officer can take archived 200 only after transactionally proving the old owner',async()=>{
 const refs=callReservationRefs(db,'politie','200');
 const docs=new Map();
 const oldClaim=refs.find(ref=>ref.path.startsWith('bpd_personnel_call_claims'));
 const fixed=refs.find(ref=>ref.path.startsWith('bpd_callsign_reservations'));
 docs.set(oldClaim.path,{dept:'politie',discordId:OLD,call:'200'});
 docs.set(fixed.path,{discordId:OLD});
 docs.set('bpd_personnel_lifecycle/politie_'+OLD,prior);
 const tx=mockTx(docs);
 const checked=await inspectCallReservation(tx,db,'politie','200');
 assert.equal(checked.blocked.length,0);
 assignCallReservation(tx,db,checked,'politie','200',NEW,{updatedAt:'now'});
 assert.ok(tx.writes.some(w=>w.op==='set'&&w.path===oldClaim.path&&w.data.discordId===NEW));
 assert.ok(tx.writes.some(w=>w.op==='delete'&&w.path===fixed.path));
 assert.equal(tx.writes.some(w=>w.op==='delete'&&w.path===oldClaim.path),false);
});

test('An active owner, unknown owner or unlinked pending intake still BLOCK reuse',async()=>{
 const claim=callReservationRefs(db,'politie','200').find(x=>
   x.path.startsWith('bpd_personnel_call_claims'));
 for(const [owner,state] of [[OLD,'active'],[OLD,undefined],[null,undefined]]){
   const docs=new Map([[claim.path,{dept:'politie',discordId:owner,call:'200'}]]);
   if(state)docs.set('bpd_personnel_lifecycle/politie_'+OLD,{...prior,state});
   const inspection=await inspectCallReservation(mockTx(docs),db,'politie','200');
   assert.equal(inspection.blocked.length,1);
   assert.throws(()=>assignCallReservation(mockTx(docs),db,inspection,
     'politie','200',NEW),/bezet of gereserveerd/);
 }
});

test('Archiving deletes only owned call reservations; unrelated reservations survive',async()=>{
 const refs=callReservationRefs(db,'politie','200');
 const fixed=refs.find(x=>x.path.startsWith('bpd_callsign_reservations'));
 const first=refs.find(x=>x.path.startsWith('bpd_personnel_call_claims'));
 const other=refs.filter(x=>x.path.startsWith('bpd_personnel_call_claims'))[1];
 const docs=new Map([[first.path,{discordId:OLD,call:'200'}],
   [fixed.path,{discordId:OLD}],[other.path,{discordId:NEW,call:'S200'}]]);
 const tx=mockTx(docs);
 const release=await prepareCallRelease(tx,db,[original]);
 releasePreparedCallClaims(tx,release);
 assert.ok(release.some(ref=>ref.path===first.path));
 assert.ok(release.some(ref=>ref.path===fixed.path));
 assert.equal(release.some(ref=>ref.path===other.path),false);
 assert.equal(tx.writes.length,2);
});

test('Roster suggestions exclude archived person and archived-owner locks only',async()=>{
 const past=overlayPersonnelLifecycle([original],[{...prior,id:'politie_'+OLD}],
   {includeArchived:true});
 const claims=[{id:'first',get:key=>({call:'200',discordId:OLD})[key]}];
 const mockDb={
   collection(name){
     if(name==='bpd_personnel_call_claims')
       return {where:()=>({get:async()=>({docs:claims})})};
     if(name==='bpd_callsign_reservations')
       return {get:async()=>({docs:[]})};
     throw Error('Unknown collection '+name);
   }
 };
 assert.equal(callHeldByArchivedMember({call:'200',discordId:OLD},past),true);
 assert.equal(callHeldByArchivedMember({call:'200',discordId:NEW},past),false);
 assert.equal((await readPoliceCallOccupation(past,mockDb)).suggested,200);
 assert.equal((await readPoliceCallOccupation([{...original,
   personId:NEW,lifecycleState:'active'}],mockDb)).suggested,210);
});

test('Reentry requires a newly chosen call and projects it without touching the old history',()=>{
 assert.throws(()=>validateLifecycleAction({
   expectedRevision:2,reason:'Gecontroleerde herinstroom'},'activate'),/roepnummer/);
 const activation=validateLifecycleAction({
   expectedRevision:2,reason:'Gecontroleerde herinstroom',newCall:'205'},'activate');
 assert.equal(activation.newCall,'205');
 assert.throws(()=>validateLifecycleAction({
   expectedRevision:2,reason:'Gecontroleerde herinstroom',newCall:'<x>'},'activate'));
 const active={...prior,state:'active',reentryCall:'205',restoreFromArchive:true};
 const current=overlayPersonnelLifecycle([original],[{...active,id:'politie_'+OLD}]);
 assert.equal(current[0].call,'205');
 assert.equal(active.snapshot.call,'200');
 assert.equal(overlayPersonnelLifecycle([],[{...active,id:'politie_'+OLD}])[0].call,'205');
});

test('Both archive entrypoints and new-personnel intake use the call ownership locks',()=>{
 const lifecycle=readFileSync(new URL('../src/personnel-lifecycle-routes.js',import.meta.url),'utf8');
 const global=readFileSync(new URL('../src/global-personnel-archive.js',import.meta.url),'utf8');
 const editor=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.match(lifecycle,/prepareCallRelease\(tx,db\(\),\[person\]\)/);
 assert.match(lifecycle,/inspectCallReservation\(tx,db\(\),dept,input\.newCall\)/);
 assert.match(lifecycle,/assignCallReservation\(tx,db\(\),reservedCall,dept,input\.newCall/);
 assert.match(global,/prepareCallRelease\(tx,db,subjects\)/);
 assert.match(global,/releasePreparedCallClaims\(tx,plan\.releasedCalls\)/);
 assert.match(editor,/uniqueNewPerson\(activeRoster,proposed\)/);
 assert.match(editor,/assignCallReservation\(tx,store,reservation/);
 assert.match(ui,/body:\{reason:reason\.trim\(\),newCall,expectedRevision:p\.revision\}/);
});
