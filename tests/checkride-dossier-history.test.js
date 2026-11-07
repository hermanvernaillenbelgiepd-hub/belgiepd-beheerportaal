import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSubjectCheckrides} from '../src/checkride-dossier-history.js';
const A='123456789012345678',B='987654321098765432';
function mockDb(){
 const calls=[];
 const db={collection:()=>({doc:track=>({
  collection:()=>({where:(field,op,id)=>({limit:n=>({
    get:async()=>{calls.push({track,field,op,id,n});return {
      size:1,docs:[{id:'record123',data:()=>({
        track,department:track.startsWith('depannage_')?'depannage':'politie',
        subjectDiscordId:id,notes:'Onder begeleiding',eventDate:'2026-11-06',
        outcome:'voldoende',average:4,status:'ingediend'})}]}
    }}
  })})})})})};
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
test('dossier reader suppresses malformed cross-person response',async()=>{
 const db={collection:()=>({doc:track=>({collection:()=>({where:()=>({limit:()=>({
   get:async()=>({size:1,docs:[{id:'x',data:()=>({
     track,department:'politie',subjectDiscordId:B,status:'ingediend'})}]})})
 })})})})};
 const result=await loadSubjectCheckrides(db,'politie',A);
 assert.equal(result.evaluations.length,0);
});
