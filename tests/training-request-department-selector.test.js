import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRAINING_REQUEST_COURSE_CATALOG} from '../public/training-course-catalog.js';
import {POLICE_REQUEST_COURSES,canSubmitTrainingRequest,policeRequestTier} from '../src/training-request-policy.js';

const markup=readFileSync(new URL('../public/opleidingscentrum.html',import.meta.url),'utf8');

test('Training request form always shows all four services and both requested catalogs',()=>{
  assert.match(markup,/const SERVICE_ORDER=\['politie','brandweer','ambulance','depannage'\]/);
  assert.match(markup,/SERVICE_ORDER\.map\(value=>\(\{value,label:NAMES\[value\]\}\)\)/);
  for(const name of ['politie','brandweer','ambulance','depannage'])
    assert.ok(TRAINING_REQUEST_COURSE_CATALOG[name]?.length>0,name);
  assert.ok(TRAINING_REQUEST_COURSE_CATALOG.brandweer.includes('Duiker'));
  assert.deepEqual(TRAINING_REQUEST_COURSE_CATALOG.politie,POLICE_REQUEST_COURSES);
});

test('Displaying course catalogs cannot bypass per-service submission permissions',()=>{
  assert.match(markup,/\$\('submit'\)\.disabled=!allowed/);
  assert.match(markup,/scope\?\.canRequest===true/);
  assert.equal(canSubmitTrainingRequest({dept:'politie',call:'220'},policeRequestTier({dept:'politie',call:'220'})),true);
  assert.equal(canSubmitTrainingRequest({dept:'politie',call:'920'},policeRequestTier({dept:'politie',call:'920'})),false);
  assert.equal(canSubmitTrainingRequest({dept:'brandweer',call:'BWM-100'},null),true);
});
