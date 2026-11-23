import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../public/verlofbeheer.html',import.meta.url),'utf8');

test('all leave applications have exactly one shared history disclosure below the list',()=>{
 const records=page.slice(page.indexOf('function record(x){'),
  page.indexOf('function sharedRequestHistory(rows){'));
 assert.doesNotMatch(records,/createElement\('details'\)/);
 const history=page.slice(page.indexOf('function sharedRequestHistory(rows){'),
  page.indexOf('function fill(id,rows){'));
 assert.match(history,/createElement\('details'\)/);
 assert.match(history,/Aanvraag- en beslissingshistoriek/);
 assert.match(page,/rows\.forEach\(x=>root\.append\(record\(x\)\)\);\s*root\.append\(sharedRequestHistory\(rows\)\)/);
 assert.match(page,/#myRequests > \.shared-history/);
});

test('history loads on expansion per original leave ID, preserves event authors and caps concurrency',()=>{
 const history=page.slice(page.indexOf('function sharedRequestHistory(rows){'),
  page.indexOf('function fill(id,rows){'));
 assert.match(history,/history\.addEventListener\('toggle',async/);
 assert.match(history,/if\(!history\.open\|\|history\.dataset\.loaded==='true'\|\|loading\)return/);
 assert.match(history,/encodeURIComponent\(x\.id\)\+'\/history'/);
 assert.match(history,/displayLeaveDate\(x\.startDate\)/);
 assert.match(history,/displayLeaveDate\(x\.endDate\)/);
 assert.match(history,/event\.actorType==='self'/);
 assert.match(history,/event\.actorType==='system'/);
 assert.match(history,/auditActionText\[event\.action\]/);
 assert.match(history,/Math\.min\(3,tasks\.length\)/);
 assert.match(history,/if\(info\.limited\)/);
});
