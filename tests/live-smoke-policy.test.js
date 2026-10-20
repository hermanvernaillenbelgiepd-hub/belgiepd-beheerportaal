import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Smoke script has valid modern Node.js syntax without executing HTTP requests',()=>{
  const result=spawnSync(process.execPath,['--check',
    new URL('../scripts/live-smoke.mjs',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
test('Smoke checks both feature flags, exact deployments and protected routes',()=>{
  const script=file('scripts/live-smoke.mjs');
  for(const token of [
    '/api/health','/api/citizens/status','/api/dossiercentrum/status',
    '/api/dossiercentrum/overview','/api/staff-dossiers/status',
    '/api/personnel/overview','/burgerdossier.html','/dossiercentrum.html',
    'BPD_EXPECTED_SHA','BPD_EXPECTED_BRANCH','401'
  ])assert.ok(script.includes(token),token);
  assert.ok(script.includes('body.deployment?.commit===expectedSha'));
  assert.ok(script.includes('body.deployment?.branch===expectedBranch'));
  assert.equal(script.includes('process.env.DISCORD_CLIENT_SECRET'),false);
  assert.equal(script.includes('process.env.BPD_FIVEM_EVIDENCE_SECRET'),false);
});
test('Smoke workflow tracks commits from the real MAIN and TEST branches',()=>{
  const workflow=file('.github/workflows/live-smoke.yml');
  assert.ok(workflow.includes('feature/verlofmodule-test'));
  assert.ok(workflow.includes('main'));
  assert.ok(workflow.includes('workflow_dispatch'));
  assert.ok(workflow.includes('github.sha'));
  assert.ok(workflow.includes('node scripts/live-smoke.mjs'));
  assert.equal(workflow.includes('secrets.'),false);
});
test('Dossier-status route exposes a flag, not protected subject data',()=>{
  const server=file('src/dossier-center-routes.js');
  assert.ok(server.includes("app.get('/api/dossiercentrum/status',(_req,res)=>"));
  assert.ok(server.includes('enabled:enabled(),readOnly:true'));
  assert.ok(server.indexOf("app.get('/api/dossiercentrum/status'")<
    server.indexOf("app.get('/api/dossiercentrum/overview'"));
});
