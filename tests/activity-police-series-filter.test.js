import test from 'node:test';
import assert from 'node:assert/strict';
import {activityPoliceSeries,matchesActivityPoliceSeries,
 availableActivityPoliceSeries} from '../public/activity-police-series-filter.js';
const people=[
 {department:'politie',series:'Reeks 1'},
 {department:'politie',series:'R02'},
 {department:'politie',series:'3'},
 {department:'brandweer',series:'Reeks 1'}
];
test('series parser recognizes current official police series',()=>{
 assert.equal(activityPoliceSeries('Reeks 1'),'1');
 assert.equal(activityPoliceSeries('R02'),'2');
 assert.equal(activityPoliceSeries('3'),'3');
 assert.equal(activityPoliceSeries('R04'),'');
 assert.equal(activityPoliceSeries(''),'');
});
test('filter keeps all authorized departments when unfiltered but isolates police series',()=>{
 assert.equal(people.filter(p=>matchesActivityPoliceSeries(p,'')).length,4);
 assert.deepEqual(people.filter(p=>matchesActivityPoliceSeries(p,'1')),[people[0]]);
 assert.deepEqual(availableActivityPoliceSeries(people),['1','2','3']);
 assert.deepEqual(availableActivityPoliceSeries(people,'brandweer'),[]);
 assert.deepEqual(availableActivityPoliceSeries([],''),[]);
});
