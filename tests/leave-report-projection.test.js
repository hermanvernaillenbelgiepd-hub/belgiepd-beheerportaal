import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectLeaveReportEvent} from '../src/leave-report-projection.js';
const id='1398985105254650007',actor='1309532438019706966';
const e={id:'entry1',type:'verlof',dept:'politie',subjectDiscordId:id,
 leaveAction:'manual_approved',leaveRequestId:'manual_central_'+id+'_2026-07-17_2026-07-24',
 registeredBy:{name:'Politioneel kader',discordId:actor},
 eventDate:'2026-11-18',details:'Verlof handmatig goedgekeurd · 2026-07-17 t/m 2026-07-24 (8 kalenderdagen)'};
const req={personDiscordId:id,subjectDepartments:['politie'],manual:true,
 startDate:'2026-07-17',endDate:'2026-07-24',note:'Familiale aangelegenheden',
 submittedByActor:{discordId:actor,name:'Bevoegd officier',call:'930'}};
test('Backfill old leave reports from authoritative leave request, without changing source',()=>{
 const original=JSON.stringify(e),next=projectLeaveReportEvent(e,req);
 assert.equal(JSON.stringify(e),original);
 assert.equal(next.eventDate,'2026-11-18');
 assert.match(next.details,/Verlofreden: Familiale aangelegenheden/);
 assert.match(next.details,/administratieve registratiedatum \(18\/11\/2026\)/);
 assert.match(next.details,/17\/07\/2026 t\.e\.m\. 24\/07\/2026/);
 assert.equal(next.registeredBy.name,'Bevoegd officier');
 assert.equal(next.registeredBy.call,'930');
});
test('Existing new-format reason is not duplicated',()=>{
 const current={...e,details:'Verlof goedgekeurd · Verlofreden: Familiale aangelegenheden'};
 assert.equal((projectLeaveReportEvent(current,{...req,manual:false}).details.match(/Verlofreden:/g)||[]).length,1);
});
test('Never disclose unrelated person or other service leave information',()=>{
 assert.equal(projectLeaveReportEvent(e,{...req,personDiscordId:'111111111111111111'}),e);
 assert.equal(projectLeaveReportEvent(e,{...req,subjectDepartments:['ambulance']}),e);
});
test('Unknown original author is never guessed; roster name is marked as current',()=>{
 const ordinary={...e,registeredBy:{name:'Bevoegd kaderlid',discordId:actor},
   leaveAction:'approved'};
 const x=projectLeaveReportEvent(ordinary,{...req,manual:false,submittedByActor:null},
   [{dept:'politie',personId:actor,name:'Verifieerbare naam',call:'930'}]);
 assert.equal(x.registeredBy.name,'Verifieerbare naam (huidige naam)');
 const unknown=projectLeaveReportEvent(ordinary,{...req,manual:false,submittedByActor:null});
 assert.equal(unknown.registeredBy.name,'Bevoegd kaderlid');
});
test('Report enrichment requires a matching request reference and does not write Firestore',()=>{
 const source=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 assert.match(source,/projectLeaveReportEvent/);
 assert.match(source,/bpd_leave_requests/);
 assert.match(source,/getAll\(/);
 assert.doesNotMatch(readFileSync(new URL('../src/leave-report-projection.js',import.meta.url),'utf8'),/tx\.create|tx\.update|batch\.set/);
});
