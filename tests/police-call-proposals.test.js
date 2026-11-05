import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderedPoliceIntakeCalls,policeCallNumber,occupiedPoliceCalls,
 firstFreePoliceCall} from '../src/callsign-utils.js';
import {readPoliceCallOccupation} from '../src/police-call-availability.js';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');

test('Police Agent first-free policy preserves the explicit priority and covers 200–299',()=>{
 const sequence=orderedPoliceIntakeCalls();
 assert.deepEqual(sequence.slice(0,7),[200,210,220,215,225,201,202]);
 assert.equal(sequence.length,100);
 assert.equal(new Set(sequence).size,100);
 assert.equal(sequence.every(x=>x>=200&&x<=299),true);
 assert.equal(firstFreePoliceCall(),200);
 assert.equal(firstFreePoliceCall({records:[{dept:'politie',call:'200'}]}),210);
 assert.equal(firstFreePoliceCall({records:[{dept:'politie',call:'200'},
   {dept:'politie',call:'S210'},{dept:'brandweer',call:'220'}],
   personnelClaims:[{call:'220'}]}),215);
 assert.equal(policeCallNumber('S-215'),215);
 assert.equal(policeCallNumber('S 225'),225);
 assert.equal(policeCallNumber('HARTS-01'),null);
});
test('manual and automatic claims exclude taken numbers and never imply reservations',()=>{
 const records=[{dept:'politie',call:'200'},{dept:'politie',call:'S210'}];
 const manual=[{call:'220'},{call:'225'}];
 const fixed=[{id:'215',call:'215'}];
 const snapshot={records,personnelClaims:manual,fixedReservations:fixed};
 assert.equal(firstFreePoliceCall(snapshot),201);
 assert.equal(occupiedPoliceCalls(snapshot).has(225),true);
 assert.equal(records.length,2); // no mutation
 assert.equal(firstFreePoliceCall({records:orderedPoliceIntakeCalls().map(call=>({
  dept:'politie',call:String(call)}))}),null);
});
test('Firestore availability checks both claim collections and the roster',async()=>{
 const seen=[];
 const snap=xs=>({docs:xs.map(x=>({id:x.id,get:key=>x[key]}))});
 const db={collection(name){
  seen.push(name);
  if(name==='bpd_personnel_call_claims')return {
   where(field,operator,value){
    assert.deepEqual([field,operator,value],['dept','==','politie']);
    return {get:async()=>snap([{id:'claim-hash',call:'210'}])};
   }};
  if(name==='bpd_callsign_reservations')
   return {get:async()=>snap([{id:'220',call:'220'}])};
  throw Error('Unexpected collection');
 }};
 const r=await readPoliceCallOccupation([{dept:'politie',call:'200'}],db);
 assert.equal(r.suggested,215);
 assert.deepEqual(seen.sort(),['bpd_callsign_reservations','bpd_personnel_call_claims']);
});
test('manual creation exposes an editable suggestion and revalidates collisions transactionally',()=>{
 const ui=read('public/personeelsbeheer.html');
 const route=read('src/personnel-editor-routes.js');
 assert.match(ui,/id="newCallSuggest"/);
 assert.match(ui,/id="newCallHint"/);
 assert.match(ui,/function proposeNewPersonnelCall\(/);
 assert.match(ui,/api\/personnel\/call-suggestion/);
 assert.match(ui,/newCallManuallyEdited=true/);
 assert.match(route,/app\.get\('\/api\/personnel\/call-suggestion'/);
 assert.match(route,/getSnapshot\(\{forceRefresh:true\}\)/);
 assert.match(route,/tx\.get\(fixedClaim\)/);
 assert.match(route,/tx\.create\(canonicalClaim/);
 assert.match(route,/tx\.create\(claim/);
});
test('automatic fixed-call requests use same order and reject manual cross-reservations',()=>{
 const route=read('src/callsign-routes.js');
 const sync=read('src/callsign-sync.js');
 assert.match(route,/const planFirstFree=async/);
 assert.match(route,/const plan=await planFirstFree\(d\.data\(\)\)/);
 assert.match(route,/plan=await planFirstFree\(current\.data\(\),req\.body\?\.preferredCall\)/);
 assert.match(route,/tx\.get\(manualRef\)/);
 assert.match(sync,/unavailableCalls:options\.unavailableCalls/);
 assert.match(route,/tx\.create\(claim/);
});
