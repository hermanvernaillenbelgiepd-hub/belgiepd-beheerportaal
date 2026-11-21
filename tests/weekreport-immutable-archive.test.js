import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {automaticFortnightReports} from '../src/fortnight-report-policy.js';
import {
 archiveCaptureKind,brusselsReportDay,encodeArchivePayload,decodeArchivePayload,
 saveAutomaticWeekReportSnapshot,readAutomaticWeekReportSnapshot
} from '../src/weekreport-archive-store.js';

class FakeDoc{
 constructor(db,path){this.db=db;this.path=path;this.id=path.split('/').at(-1)}
 collection(name){return new FakeCollection(this.db,this.path+'/'+name)}
 async get(){
  const data=this.db.rows.get(this.path);
  return {id:this.id,exists:data!==undefined,data:()=>data,
   get:key=>data?.[key]};
 }
 async create(data){
  if(this.db.rows.has(this.path))throw Object.assign(Error('exists'),{code:6});
  this.db.rows.set(this.path,structuredClone(data));
 }
}
class FakeCollection{
 constructor(db,path){this.db=db;this.path=path}
 doc(name){return new FakeDoc(this.db,this.path+'/'+name)}
}
class FakeFirestore{
 rows=new Map();
 collection(name){return new FakeCollection(this,name)}
 async getAll(...refs){return Promise.all(refs.map(r=>r.get()))}
}
const payload=()=>({
 report:{...automaticFortnightReports('politie','2026-11-09',2)[1]},
 sections:[{type:'notitie',label:'Notities',entries:[
  {id:'note',type:'notitie',eventDate:'2026-11-01',
   details:'Oorspronkelijke dossierinformatie',registeredBy:{name:'Opleider'}}]}],
 completionSummary:{present:0,passed:0,failed:0,interrupted:0,attendanceConfirmed:0},
 recordCount:1,excludedTestCount:0,truncated:false,canExport:false,
 disclaimer:'HISTORISCHE RECONSTRUCTIE'
});
const firstClosure=new Date('2026-11-09T01:15:00.000Z');

test('afgesloten rapport krijgt één vaste kopie en blijft ongewijzigd na latere dossiermutaties',async()=>{
 const db=new FakeFirestore(),source=payload();
 assert.equal(brusselsReportDay(firstClosure),'2026-11-09');
 assert.equal(archiveCaptureKind(source.report,'2026-11-09'),'automatisch_na_afsluiting');
 const first=await saveAutomaticWeekReportSnapshot({db,payload:source,now:firstClosure});
 assert.equal(first.created,true);
 source.sections[0].entries[0].details='LATERE WIJZIGING MAG NIET DOORKOMEN';
 const second=await saveAutomaticWeekReportSnapshot({db,payload:source,now:firstClosure});
 assert.equal(second.created,false);
 const read=await readAutomaticWeekReportSnapshot({db,id:source.report.id});
 assert.equal(read.sections[0].entries[0].details,'Oorspronkelijke dossierinformatie');
 assert.equal(read.archiveInfo.immutable,true);
 assert.equal(read.archiveInfo.kind,'automatisch_na_afsluiting');
 assert.match(read.disclaimer,/Latere wijzigingen/);
 assert.equal(db.rows.has('bpd_weekreport_snapshots/'+source.report.id),true);
});
test('oud rapport krijgt transparant retrospectief label en controleerbare checksum',async()=>{
 const db=new FakeFirestore(),source=payload();
 await saveAutomaticWeekReportSnapshot({
  db,payload:source,now:new Date('2026-11-21T09:00:00Z')});
 const read=await readAutomaticWeekReportSnapshot({db,id:source.report.id});
 assert.equal(read.archiveInfo.kind,'retrospectief_vastgezet');
 assert.match(read.disclaimer,/niet welke gegevens exact/);
 const packed=encodeArchivePayload(source,'2026-11-21');
 const manifest={...db.rows.get('bpd_weekreport_snapshots/'+source.report.id)};
 assert.equal(decodeArchivePayload(packed.chunks,manifest).report.id,source.report.id);
 assert.throws(()=>decodeArchivePayload([packed.chunks[0].slice(0,-8)+'abcdefgh'],manifest),
  /Archiefcontrole mislukt/);
});
test('lopende, afgeknotte en inhoudelijk foutieve rapporten worden nooit gearchiveerd',async()=>{
 const db=new FakeFirestore(),source=payload();
 await assert.rejects(saveAutomaticWeekReportSnapshot({
  db,payload:source,now:new Date('2026-11-06T08:00:00Z')}));
 await assert.rejects(saveAutomaticWeekReportSnapshot({
  db,payload:{...source,truncated:true},now:firstClosure}));
 await assert.rejects(saveAutomaticWeekReportSnapshot({
  db,payload:{...source,report:{...source.report,periodEnd:'2026-11-09'}},now:firstClosure}));
 assert.equal(db.rows.size,0);
});
test('report routes and startup runner enforce read/export scopes and use archived payload',()=>{
 const route=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(route,/if\(!archiveCapture&&/);
 assert.match(route,/readAutomaticWeekReportSnapshot\(\{db:db\(\),id\}\)/);
 assert.match(route,/if\(frozen\)return \{\.\.\.frozen,/);
 assert.match(route,/mayReadFortnightPeriod\(req\.bpd,report,today,snap\.data\)/);
 assert.match(route,/if\(report\.canExport!==true\)return res\.status\(403\)/);
 assert.match(route,/saveAutomaticWeekReportSnapshot\(\{/);
 assert.match(route,/if\(payload\.status\|\|payload\.truncated\)/);
 assert.match(server,/weekreportArchiver\.scheduleAutomaticWeekReportArchives\(\)/);
});
