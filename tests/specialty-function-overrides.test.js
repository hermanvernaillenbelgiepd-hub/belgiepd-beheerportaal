import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFunctionOverrides,resolveFunctionOverrides} from '../src/specialty-function-overrides.js';
const allowed=['K9','MOTARD','AE','SIGNALISATIE'];
test('groepseleider and instructeur are independent, even when Discord appears identical',()=>{
 const choices=validateFunctionOverrides({AE:'groepsleider',K9:'beide',MOTARD:'lid'},allowed,['SIGNALISATIE']);
 const result=resolveFunctionOverrides(['AE','MOTARD'],choices);
 assert.deepEqual(result.groupLeaders,['AE','K9']);
 assert.deepEqual(result.instructors,['K9']);
 assert.deepEqual(resolveFunctionOverrides(['AE'],{AE:'instructeur'}).instructors,['AE']);
 assert.deepEqual(resolveFunctionOverrides(['AE'],{}).instructors,['AE']);
});
test('invalid or unauthorized functions are rejected',()=>{
 for(const invalid of [{UNLISTED:'groepsleider'},{SIGNALISATIE:'instructeur'},{AE:'admin'},[]])
  assert.throws(()=>validateFunctionOverrides(invalid,allowed,['SIGNALISATIE']));
});
