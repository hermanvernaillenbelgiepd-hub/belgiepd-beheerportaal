import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import {once} from 'node:events';
import {Timestamp} from 'firebase-admin/firestore';
import {mayEditTechnicalSettings,mayOpenTechnicalCenter,
 DEFAULT_TECHNICAL_SETTINGS,technicalSettingsFrom,validateTechnicalSettings,
 loadTechnicalSettings,writeTechnicalSettings,installTechnicalCenterRoutes}
 from '../src/technical-center-config.js';
import {shouldAutoArchiveBasicObservation,
 runBasicObservationAutoArchive,BASIC_OBSERVATION_RETENTION_DAYS}
 from '../src/basic-observation-auto-archive.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='930930930930930930';
const technical={
 uid:'discord:'+id,discordId:id,role:'beheerder',
 portalTechnicalMode:true,profileTechnicalAvailable:true,
 departments:['politie'],departmentRoles:{politie:'officierenkader'}
};
const officer={...technical,role:'officierenkader',portalTechnicalMode:false,
 profileTechnicalAvailable:false};
const body={expectedRevision:0,observationArchiveEnabled:true,
 observationArchiveDays:45,reason:'Aanpassing na controle officierenkader'};
function fakeFirestore(){
 const docs=new Map(),events=[];
 const settingsDoc={id:'automation',get:async()=>({data:()=>docs.get('automation')})};
 const collection=name=>({
  doc(id){
   if(name==='bpd_portal_technical_settings'){
    assert.equal(id,'automation');
    return settingsDoc;
   }
   if(name==='bpd_portal_technical_settings_audit')return {audit:true,id:id||'audit'};
   throw Error('unexpected collection '+name);
  },
  orderBy(field,direction){
   assert.equal(name,'bpd_portal_technical_settings_audit');
   assert.equal(field,'at');assert.equal(direction,'desc');
   return {limit(limit){
    return {get:async()=>({docs:events.slice(-limit).reverse().map((data,i)=>({
     id:'audit_'+i,
     data:()=>({...data,at:{toDate:()=>new Date('2026-11-04T10:00:00Z')}})
    }))})};
   }};
  }
 });
 const db={
  collection,
  async runTransaction(callback){
   return callback({
    get:async ref=>({data:()=>docs.get(ref.id)||undefined}),
    set:(ref,value)=>docs.set(ref.id,value),
    create:(ref,value)=>{assert.equal(ref.audit,true);events.push(value)}
   });
  }
 };
 return {db,docs,events};
}
test('Technisch beheer vereist echte Discord-identiteit én geselecteerd technisch profiel',()=>{
 assert.equal(mayEditTechnicalSettings(technical),true);
 assert.equal(mayOpenTechnicalCenter(technical),true);
 assert.equal(mayEditTechnicalSettings(officer),false);
 assert.equal(mayEditTechnicalSettings({...technical,portalTechnicalMode:false}),false);
 assert.equal(mayEditTechnicalSettings({...technical,profileTechnicalAvailable:false}),false);
 assert.equal(mayEditTechnicalSettings({...technical,uid:'discord:111111111111111111'}),false);
 assert.equal(mayEditTechnicalSettings({...technical,discordId:'930'}),false);
});
test('Configuratie begint met de bestaande veilige standaard: 30 dagen, ingeschakeld',()=>{
 assert.deepEqual(DEFAULT_TECHNICAL_SETTINGS,
  {observationArchiveEnabled:true,observationArchiveDays:30});
 assert.deepEqual(technicalSettingsFrom(null),{...DEFAULT_TECHNICAL_SETTINGS,revision:0});
 assert.equal(BASIC_OBSERVATION_RETENTION_DAYS,30);
});
test('Instellingen accepteren uitsluitend expliciete velden, 7–365 dagen en motivering',()=>{
 assert.equal(validateTechnicalSettings(body).observationArchiveDays,45);
 for(const candidate of [
  {...body,observationArchiveDays:0},
  {...body,observationArchiveDays:366},
  {...body,observationArchiveDays:30.5},
  {...body,observationArchiveDays:'30'},
  {...body,observationArchiveEnabled:'false'},
  {...body,expectedRevision:'0'},
  {...body,reason:'kort'},
  {...body,secret:'abc'},
  {...body,reason:'<script>alert(1)</script>'}
 ])assert.throws(()=>validateTechnicalSettings(candidate));
});
test('Firestore bewaart revisies en audit, en verwerpt verouderde of onbevoegde wijzigingen',async()=>{
 const {db,events}=fakeFirestore();
 assert.deepEqual(await loadTechnicalSettings(db),
  {...DEFAULT_TECHNICAL_SETTINGS,revision:0});
 await assert.rejects(writeTechnicalSettings(db,officer,body),{status:403});
 const saved=await writeTechnicalSettings(db,technical,body);
 assert.equal(saved.changed,true);
 assert.equal(saved.config.revision,1);
 assert.equal(saved.config.observationArchiveDays,45);
 assert.equal(events.length,1);
 assert.equal(events[0].actorUid,technical.uid);
 assert.equal(events[0].before.observationArchiveDays,30);
 assert.equal(events[0].after.observationArchiveDays,45);
 await assert.rejects(writeTechnicalSettings(db,technical,body),{status:409});
 const same=await writeTechnicalSettings(db,technical,{
  ...body,expectedRevision:1});
 assert.equal(same.changed,false);
 assert.equal(events.length,1,'Geen fictieve audit bij ongewijzigde waarden');
 const paused=await writeTechnicalSettings(db,technical,{
  ...body,observationArchiveEnabled:false,expectedRevision:1,
  reason:'Pauzeren voor veiligheidscontrole'});
 assert.equal(paused.config.observationArchiveEnabled,false);
 assert.equal(events.length,2);
});
test('Beveiligde GET en PUT zijn daadwerkelijk te bedienen, niet alleen een simulatie van knoppen',async()=>{
 const {db}=fakeFirestore();
 const app=express();
 app.use('/api/technical-center',express.json({limit:'3kb',strict:true}));
 let current=technical;
 installTechnicalCenterRoutes(app,{requireUser:(req,_res,next)=>{
  req.bpd=current;next();
 },dbFactory:()=>db});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const send=async(method,path,data)=>{
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:res.status,body:await res.json()};
 };
 try{
  const initial=await send('GET','/api/technical-center/context');
  assert.equal(initial.status,200);assert.equal(initial.body.canEdit,true);
  assert.equal(initial.body.config.observationArchiveDays,30);
  const changed=await send('PUT','/api/technical-center/config',body);
  assert.equal(changed.status,200);assert.equal(changed.body.saved,true);
  const currentConfig=await send('GET','/api/technical-center/context');
  assert.equal(currentConfig.body.config.observationArchiveDays,45);
  assert.equal(currentConfig.body.history.length,1);
  const stale=await send('PUT','/api/technical-center/config',body);
  assert.equal(stale.status,409);
  current=officer;
  const forbidden=await send('PUT','/api/technical-center/config',{
   ...body,expectedRevision:1});
  assert.equal(forbidden.status,403);
 }finally{await new Promise((resolve,reject)=>
   server.close(error=>error?reject(error):resolve()))}
});
test('30 of 45 dagen: de worker archiveert volgens de geselecteerde termijn',()=>{
 const now=Date.UTC(2026,10,4,12);
 const older={type:'observatie',dept:'politie',archivedAt:null,
  createdAt:Timestamp.fromMillis(now-35*86400000)};
 assert.equal(shouldAutoArchiveBasicObservation(older,now),true);
 assert.equal(shouldAutoArchiveBasicObservation(older,now,45),false);
 assert.equal(shouldAutoArchiveBasicObservation(older,now,30),true);
 assert.equal(shouldAutoArchiveBasicObservation({...older,archivedAt:Timestamp.fromMillis(now)},now,7),false);
});
test('Nieuwe instelling wordt elke uurlijkse cyclus gelezen; geen serverherstart nodig',()=>{
 const worker=read('src/basic-observation-auto-archive.js');
 const server=read('src/server.js');
 const page=read('public/beheercentrum.html');
 const nav=read('public/bpd-navigation.js');
 assert.match(worker,/const config=await readSettings\(\)/);
 assert.match(worker,/if\(config\.observationArchiveEnabled!==true\)return/);
 assert.match(worker,/run\(\{retentionDays:config\.observationArchiveDays\}\)/);
 assert.match(worker,/retentionDays\*24\*60\*60\*1000/);
 assert.match(server,/installTechnicalCenterRoutes\(app,\{requireUser\}\)/);
 assert.match(server,/\/api\/technical-center',express\.json/);
 assert.match(page,/id="settingsForm"/);
 assert.match(page,/id="history"/);
 assert.match(page,/\/api\/technical-center\/config/);
 assert.match(nav,/href:'\/beheercentrum\.html'/);
 assert.doesNotMatch(worker,/process\.env\.BPD_PORTAL_CONFIG_SECRET/);
});
