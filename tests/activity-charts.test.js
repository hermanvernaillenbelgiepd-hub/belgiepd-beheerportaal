import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chartStatuses,chartAbsence,chartHoursSources,chartHoursRank}
 from '../public/activity-charts-model.js';
const people=[
 {name:'A',call:'100',currentStatus:'ACTIEF',effectiveInactiveDays:5,
  historicalRecords:[{date:'2026-11-16',hours:23},{date:'2026-10-15',hours:8}]},
 {name:'B',call:'200',currentStatus:'50/50',effectiveInactiveDays:25,
  historicalRecords:[{date:'2026-11-16',hours:0}]},
 {name:'C',call:'300',currentStatus:'INACTIEF',effectiveInactiveDays:48,
  historicalRecords:[{date:'2026-11-16',hours:12}]},
 {name:'D',call:'400',currentStatus:'ACTIEF',leave:{active:true},effectiveInactiveDays:3},
 {name:'E',call:'500',currentStatus:'ACTIEF',returnChecking:true,effectiveInactiveDays:null},
 {name:'F',call:'600',currentStatus:'GESCHORST',effectiveInactiveDays:61},
 {name:'G',call:'700',currentStatus:'ACTIEF',effectiveInactiveDays:null}
];
test('status donut partitions scoped dossiers exactly once',()=>{
 assert.deepEqual(chartStatuses(people).map(x=>x.value),[2,1,1,1,1,1]);
 assert.equal(chartStatuses(people).reduce((n,x)=>n+x.value,0),7);
});
test('effective inactivity graph respects leave and incomplete sources',()=>{
 assert.deepEqual(chartAbsence(people,true).map(x=>x.value),[1,1,1,1,1,2]);
 assert.deepEqual(chartAbsence(people,false).map(x=>x.value),[0,0,0,0,0,7]);
});
test('historical snapshot dates are explicit and zero hours are ranked',()=>{
 const sources=chartHoursSources(people);
 assert.deepEqual(sources.map(x=>x.key),['historic:2026-11-16','historic:2026-10-15']);
 assert.deepEqual(chartHoursRank(people,sources[0]).top.map(x=>x.name),['A','C','B']);
 assert.deepEqual(chartHoursRank(people,sources[0]).bottom.map(x=>x.name),['B','C','A']);
 assert.equal(chartHoursRank(people,sources[0]).bottom[0].hours,0);
});
test('verified month is separate and takes precedence when available',()=>{
 const withVerified=[...people,{name:'V',call:'800',verified:true,periodPlayHours:17,
  historicalRecords:[{date:'2026-11-16',hours:5}]}];
 const sources=chartHoursSources(withVerified);
 assert.equal(sources[0].key,'verified');
 assert.deepEqual(chartHoursRank(withVerified,sources[0]).top.map(x=>x.name),['V']);
 assert.equal(sources[1].count,4);
});
test('lazy, accessible, responsive, filter-scoped and read-only charts',()=>{
 const html=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/activity-charts.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/activity-charts.css',import.meta.url),'utf8');
 assert.match(html,/<details id="activityGraphs" class="activity-data-fold">/);
 assert.match(html,/renderActivityGraphs\(\{people:visible,sources\}\)/);
 assert.match(html,/if\(\$\('activityGraphs'\)\.open\)/);
 assert.match(html,/activityGraphHoursSource/);
 assert.match(js,/aria-label/);
 assert.match(js,/role','img'/);
 assert.doesNotMatch(js,/fetch\(|\/api\/management|postMessage/);
 assert.match(css,/data-bpd-theme="dark"/);
 assert.match(css,/@media\(max-width:900px\)/);
});
