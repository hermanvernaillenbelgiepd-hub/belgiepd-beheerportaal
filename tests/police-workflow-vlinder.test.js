import test from 'node:test';
import assert from 'node:assert/strict';
import {policeWorkflowSeriesTargets} from '../public/assets/police-vlinder.js';
const parse=x=>{const match=/^(?:reeks )?([1-3])$/i.exec(String(x??''));return match?Number(match[1]):null;};
test('VLINDER belongs visually to all three series',()=>{
 for(const source of [{series:'VLINDER'},{series:'',reekshoofdReeks:'Vlinder'},{series:'Reeks 2',reekshoofdReeks:'VLINDER'}])
  assert.deepEqual(policeWorkflowSeriesTargets(source,parse),[1,2,3]);
 assert.deepEqual(policeWorkflowSeriesTargets({call:'770',series:''},parse),[]);
 assert.deepEqual(policeWorkflowSeriesTargets({call:'770',series:'Reeks 2'},parse),[2]);
});
