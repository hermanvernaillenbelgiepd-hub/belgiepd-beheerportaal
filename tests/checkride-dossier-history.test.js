import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSubjectCheckrides} from '../src/checkride-dossier-history.js';

const A='123456789012345678', B='987654321098765432';
function mockDb(transform=record=>record,{previousId=null,aliasValid=true}={}){
 const calls=[];
 const db={
   collection(collectionName){
     if(collectionName==='bpd_identity_transfer_targets')return {
       doc:()=>({get:async()=>previousId?{exists:true,get:()=>previousId}:{exists:false}})
     };
     if(collectionName==='bpd_identity_transfers')return {
       doc:()=>({get:async()=>({exists:true,get:key=>{
         if(key==='status')return aliasValid?'completed':'pending';
         if(key==='newDiscordId')return A;
         return null;
       }})})
     };
     assert.equal(collectionName,'bpd_checkride_tracks');
     return {
       doc(track){
         return {
           collection(name){
             assert.equal(name,'evaluations');
             return {
               where(field,op,id){
                 return {
                   limit(n){
                     return {
                       async get(){
                         calls.push({track,field,op,id,n});
                         const record=transform({
                           track,department:track.startsWith('depannage_')?'depannage':'politie',
                           subjectDiscordId:id,notes:'Onder begeleiding',
                           eventDate:'2026-11-06',outcome:'voldoende',
                           average:4,status:'ingediend'
                         });
                         return {size:1,docs:[{id:'record123',data:()=>record}]};
                       }
                     };
                   }
                 };
               }
             };
           }
         };
       }
     };
   }
 };
 return {db,calls};
}
test('dossier reader only queries tracks of target service and subject',async()=>{
 const {db,calls}=mockDb();
 const result=await loadSubjectCheckrides(db,'depannage',A);
 assert.deepEqual(calls.map(x=>x.track),['depannage_lsra','depannage_fast','depannage_crane']);
 assert.ok(calls.every(x=>x.id===A&&x.field==='subjectDiscordId'&&x.op==='=='));
 assert.equal(result.evaluations.length,3);
 assert.ok(result.evaluations.every(x=>x.department==='depannage'&&x.subjectDiscordId===A));
});
test('dossier reader never resolves cross-service or invalid identity',async()=>{
 const {db,calls}=mockDb();
 await assert.rejects(loadSubjectCheckrides(db,'citizens',B));
 await assert.rejects(loadSubjectCheckrides(db,'burger','wrong'));
 assert.equal(calls.length,0);
});
test('Overgenomen koppelritten zijn alleen zichtbaar na voltooide dubbel geverifieerde overdracht',async()=>{
 const {db,calls}=mockDb(record=>record,{previousId:B});
 const result=await loadSubjectCheckrides(db,'depannage',A);
 assert.equal(calls.length,6);
 assert.deepEqual([...new Set(calls.map(x=>x.id))],[A,B]);
 assert.equal(result.evaluations.length,6);
 assert.ok(result.evaluations.every(x=>x.subjectDiscordId===A));
});
test('Onvolledige overdracht geeft nooit andermans koppelritgegevens vrij',async()=>{
 const {db,calls}=mockDb(record=>record,{previousId:B,aliasValid:false});
 await assert.rejects(loadSubjectCheckrides(db,'depannage',A),/niet onafhankelijk/);
 assert.equal(calls.length,0);
});
test('dossier reader suppresses malformed cross-person response',async()=>{
 const {db}=mockDb(record=>({...record,subjectDiscordId:B}));
 const result=await loadSubjectCheckrides(db,'politie',A);
 assert.equal(result.evaluations.length,0);
});
