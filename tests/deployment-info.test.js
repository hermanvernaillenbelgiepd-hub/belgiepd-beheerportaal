import test from 'node:test';
import assert from 'node:assert/strict';
import {publicDeploymentInfo} from '../src/deployment-info.js';

const revision='d6fa7eb25f05d094cad95ebdf4d0b4692e9d0086';
test('Render commit and branch are available as non-secret release metadata',()=>{
  assert.deepEqual(publicDeploymentInfo({RENDER_GIT_COMMIT:revision,
    RENDER_GIT_BRANCH:'main',DISCORD_CLIENT_SECRET:'sensitive-secret',
    BPD_FIVEM_EVIDENCE_SECRET:'another-secret'}),{
    commit:revision,branch:'main'
  });
});
test('Invalid or absent deploy metadata is never echoed',()=>{
  assert.deepEqual(publicDeploymentInfo({}),{commit:null,branch:null});
  assert.deepEqual(publicDeploymentInfo({RENDER_GIT_COMMIT:'secret=abcd',
    RENDER_GIT_BRANCH:'branch\nSECRET_KEY=value'}),{commit:null,branch:null});
  assert.deepEqual(publicDeploymentInfo({RENDER_GIT_COMMIT:'INVALID SHA',
    RENDER_GIT_BRANCH:'feature/citizen-dossiers-20261020'}),{
    commit:null,branch:'feature/citizen-dossiers-20261020'
  });
});
