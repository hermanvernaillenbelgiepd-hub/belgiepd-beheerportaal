import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brusselsEventDate,scheduledTrainingEventDate} from '../src/personnel-event-date.js';
import {validateManagementEntry,reportSections} from '../src/management-utils.js';
import {fortnightFor} from '../src/fortnight-report-policy.js';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Training occurrence uses Brussels local date of the actual planned session, not later confirmation',()=>{
 assert.equal(scheduledTrainingEventDate('2026-11-08T23:30:00.000Z'),'2026-11-09');
 assert.equal(scheduledTrainingEventDate('2026-10-25T23:30:00.000Z'),'2026-10-26');
 assert.equal(brusselsEventDate('2026-11-18T23:15:00.000Z'),'2026-11-19');
 assert.equal(brusselsEventDate('2026-07-17T22:30:00.000Z'),'2026-07-18');
 assert.throws(()=>scheduledTrainingEventDate('niet geldig'));
});
test('Historical promotions and all movements retain specified occurrence date and structured rank/call',()=>{
 const record=validateManagementEntry({type:'personeelsbeweging',
   eventDate:'2026-04-05',details:'Oud dossier bij overdracht van de administratie',
   movement:'Promotie',previousRank:'Agent',newRank:'Aspirant Inspecteur',
   previousCall:'210',newCall:'320'});
 assert.deepEqual([record.eventDate,record.reportCategory,record.previousRank,
   record.newRank,record.previousCall,record.newCall],
  ['2026-04-05','personeelsbeweging','Agent','Aspirant Inspecteur','210','320']);
 assert.throws(()=>validateManagementEntry({type:'personeelsbeweging',
  eventDate:'2026-05-44',details:'Oude geregistreerde bevordering',movement:'Promotie'}));
 const interval=fortnightFor('2026-04-05','politie');
 const sections=reportSections([record],interval.periodStart,interval.periodEnd);
 assert.equal(sections.find(s=>s.type==='personeelsbeweging').entries.length,1);
});
test('Lifecycle, modern grade change and legacy promotion all write a dated immutable dossier event',()=>{
 const rank=source('src/personnel-editor-routes.js');
 const lifecycle=source('src/personnel-lifecycle-routes.js');
 const report=source('src/management-routes.js');
 assert.match(rank,/source:'personnel-legacy-promotion'/);
 assert.match(rank,/source:'personnel-rank-change'/);
 assert.match(rank,/dossierCaseLogged:true/);
 assert.match(rank,/tx\.create\(caseRef,/);
 assert.match(lifecycle,/source:'honorable-inp-reentry'/);
 assert.match(lifecycle,/source:'personnel-lifecycle-'\+action/);
 assert.match(lifecycle,/dossierCaseLogged:true,eventDate/);
 assert.match(report,/const snap=await getSnapshot\(\{includeArchived:true\}\)/);
 assert.match(report,/change\.dossierCaseLogged===true/);
});
test('Training completion appears in dossier and fortnight report on scheduled event date, without duplicate register',()=>{
 const action=source('src/training-request-routes.js');
 const dossier=source('public/personeelsbeheer.html');
 const report=source('src/management-routes.js');
 assert.match(action,/scheduledTrainingEventDate\(eventSnap\.get\('startAt'\)\)/);
 assert.match(action,/eventDate:trainingEventDate/);
 assert.match(action,/type:action==='uitgevoerd'\?'opleiding':'activiteit'/);
 assert.match(action,/tx\.create\(notification,/);
 assert.match(dossier,/linkedCompletedRequestRecords/);
 assert.match(dossier,/x\.trainingRequestId&&x\.reportCategory==='opleiding'/);
 assert.match(dossier,/x\.result==='geslaagd'\|\|x\._trainingSource==='request'/);
 assert.match(report,/\.where\('eventDate','>=',report\.periodStart\)/);
 assert.match(report,/\.collection\('records'\)\.where\('eventDate','>=',report\.periodStart\)/);
});
