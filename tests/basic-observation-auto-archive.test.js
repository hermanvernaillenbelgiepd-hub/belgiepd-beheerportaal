import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Timestamp} from 'firebase-admin/firestore';
import {basicObservationDueAt,shouldAutoArchiveBasicObservation,
 BASIC_OBSERVATION_RETENTION_MS,BASIC_OBSERVATION_RETENTION_DAYS,
 BASIC_OBSERVATION_SYSTEM_ACTOR,runBasicObservationAutoArchive}
 from '../src/basic-observation-auto-archive.js';

const day=24*60*60*1000;
const now=Date.UTC(2026,10,4,15,39,0);
const stamp=ms=>Timestamp.fromMillis(ms);
const obs=(ageDays,more={})=>({
 type:'observatie',dept:'politie',
 createdAt:stamp(now-ageDays*day),
 subjectDiscordId:'208208208208208208',
 archivedAt:null,...more
});

function fakeFirestore(records){
 const items=records.map((row,i)=>({
  id:'observation_'+String(i).padStart(4,'0'),
  ref:{id:'observation_'+String(i).padStart(4,'0')},
  value:{...row}
 }));
 const audit=[];
 const db={
  collection(name){
   if(name==='bpd_basic_observation_audit')
    return {doc:()=>({audit:true,id:'audit_'+audit.length})};
   assert.equal(name,'bpd_basic_observations');
   return {
    orderBy(field,direction){
     assert.equal(field,'createdAt');assert.equal(direction,'asc');
     let cutoff=Infinity,pageSize=100,start=null;
     const query={
      endAt(value){cutoff=value.toMillis();return query},
      limit(value){pageSize=value;return query},
      startAfter(doc){start=doc.id;return query},
      async get(){
       const eligible=items.filter(d=>d.value.createdAt?.toMillis?.()<=cutoff)
        .sort((a,b)=>a.value.createdAt.toMillis()-b.value.createdAt.toMillis()||
          a.id.localeCompare(b.id));
       const startIndex=start?eligible.findIndex(e=>e.id===start)+1:0;
       const page=eligible.slice(startIndex,startIndex+pageSize).map(e=>({
        id:e.id,ref:e.ref,data:()=>({...e.value})
       }));
       return {docs:page,empty:page.length===0,size:page.length};
      }
     };
     return query;
    }
   };
  },
  async runTransaction(cb){
   const tx={
    get:async ref=>{
     const d=items.find(x=>x.id===ref.id);
     return {exists:!!d,data:()=>({...d.value}),get:key=>d.value[key]};
    },
    update:(ref,values)=>{
     const d=items.find(x=>x.id===ref.id);
     assert.ok(d);
     Object.assign(d.value,values);
    },
    create:(ref,values)=>{
     assert.equal(ref.audit,true);
     audit.push(values);
    }
   };
   return cb(tx);
  }
 };
 return {db,items,audit};
}

test('Exact 30 days after server submission (not the next calendar month)',()=>{
 assert.equal(BASIC_OBSERVATION_RETENTION_DAYS,30);
 assert.equal(BASIC_OBSERVATION_RETENTION_MS,30*day);
 assert.equal(shouldAutoArchiveBasicObservation(obs(29.999),now),false);
 assert.equal(shouldAutoArchiveBasicObservation(obs(30),now),true);
 assert.equal(shouldAutoArchiveBasicObservation(obs(31),now),true);
 const feb=Date.UTC(2027,1,27,12);
 const row={type:'observatie',dept:'politie',createdAt:stamp(feb),archivedAt:null};
 assert.equal(shouldAutoArchiveBasicObservation(row,Date.UTC(2027,2,1,12)),false);
 assert.equal(shouldAutoArchiveBasicObservation(row,feb+30*day),true);
});
test('No auto-archive of manually archived, wrong service, other type, missing timestamps',()=>{
 assert.equal(shouldAutoArchiveBasicObservation(obs(41,{archivedAt:stamp(now-2*day)}),now),false);
 assert.equal(shouldAutoArchiveBasicObservation(obs(41,{dept:'brandweer'}),now),false);
 assert.equal(shouldAutoArchiveBasicObservation(obs(41,{type:'sanctie'}),now),false);
 assert.equal(shouldAutoArchiveBasicObservation(obs(41,{createdAt:undefined}),now),false);
});
test('Manual restore starts a new 30-day window, preventing immediate re-archiving',()=>{
 const old=obs(91,{restoredAt:stamp(now-3*day)});
 assert.equal(shouldAutoArchiveBasicObservation(old,now),false);
 assert.equal(basicObservationDueAt(old),now+27*day);
 assert.equal(shouldAutoArchiveBasicObservation({
  ...old,restoredAt:stamp(now-30*day)
 },now),true);
});
test('Automatic run archives only due observations, keeps details and writes an audit record',async()=>{
 const originals=[
  obs(45,{details:'Originele inhoud blijft bewaard',registeredBy:{call:'432'}}),
  obs(30),
  obs(29),
  obs(90,{archivedAt:stamp(now-89*day)}),
  obs(60,{restoredAt:stamp(now-2*day)}),
  obs(90,{dept:'ambulance'})
 ];
 const {db,items,audit}=fakeFirestore(originals);
 const result=await runBasicObservationAutoArchive({db,now:new Date(now)});
 assert.equal(result.scanned,5,'Only old candidates are scanned');
 assert.equal(result.archived,2);
 assert.equal(result.complete,true);
 assert.equal(items[0].value.details,'Originele inhoud blijft bewaard');
 assert.deepEqual(items[0].value.registeredBy,{call:'432'});
 assert.equal(items[0].value.archivedBy,BASIC_OBSERVATION_SYSTEM_ACTOR);
 assert.equal(items[0].value.archiveReason,'automatic_30_days');
 assert.ok(items[0].value.archivedAt);
 assert.ok(items[1].value.archivedAt);
 assert.equal(items[2].value.archivedAt,null);
 assert.equal(items[4].value.archivedAt,null);
 assert.equal(audit.length,2);
 for(const event of audit){
  assert.equal(event.action,'auto_archive');
  assert.equal(event.actorUid,BASIC_OBSERVATION_SYSTEM_ACTOR);
  assert.equal(event.retentionDays,30);
  assert.equal(event.subjectDiscordId,'208208208208208208');
 }
 const next=await runBasicObservationAutoArchive({db,now:new Date(now)});
 assert.equal(next.archived,0,'Idempotent: no duplicate audit events on retry');
 assert.equal(audit.length,2);
});
test('Automatic run paginates past 150 already archived items without losing eligible entries',async()=>{
 const records=Array.from({length:195},(_,i)=>
  obs(80-i/100,{archivedAt:i<180?stamp(now-day):null}));
 const {db,audit}=fakeFirestore(records);
 const result=await runBasicObservationAutoArchive({db,now:new Date(now)});
 assert.equal(result.scanned,195);
 assert.equal(result.archived,15);
 assert.equal(audit.length,15);
});
test('Startup scheduler and manual restore are separate from personal observation content',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/basic-observation-routes.js',import.meta.url),'utf8');
 const view=readFileSync(new URL('../public/registraties.html',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/basic-observation-auto-archive.js',import.meta.url),'utf8');
 assert.match(server,/scheduleBasicObservationAutoArchive\(\)/);
 assert.match(worker,/setInterval\(\(\)=>void tick\(\),INTERVAL_MS\)/);
 assert.match(worker,/if\(running\)return/);
 assert.match(worker,/tx\.update\(record\.ref,\{archivedAt:at/);
 assert.match(worker,/collection\(AUDIT\)\.doc\(\)/);
 assert.doesNotMatch(worker,/tx\.delete\(|\.delete\(/);
 assert.match(route,/restoredAt:body\.archived\?null:at/);
 assert.match(view,/30 dagen na indiening automatisch gearchiveerd/);
});
