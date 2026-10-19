import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Citizen self-service browser script has valid JavaScript syntax',()=>{
  const html=source('public/burgerdossier.html');
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,'inline page module');
  assert.doesNotThrow(()=>new Script(match[1],{filename:'burgerdossier.html'}));
  assert.ok(html.includes('/api/citizens/me/register'));
  assert.ok(html.includes('/api/citizens/me'));
  assert.equal(/\.innerHTML\s*=/.test(html),false);
});
test('Login return paths allow the citizen dossier only through explicit allowlists',()=>{
  const policy=source('src/discord-utils.js');
  const login=source('public/discord-status.html');
  assert.ok(policy.includes("'/burgerdossier.html'"));
  assert.ok(policy.includes("'/dossiercentrum.html'"));
  assert.ok(login.includes("'/burgerdossier.html'"));
});
test('Citizen API is self-scoped and cannot take a target Discord ID in its routes',()=>{
  const routes=source('src/citizen-routes.js');
  assert.ok(routes.includes("app.get('/api/citizens/me'"));
  assert.ok(routes.includes("app.post('/api/citizens/me/register'"));
  assert.equal(routes.includes('/api/citizens/:discordId'),false);
  assert.ok(routes.includes('verifiedCitizenId(decoded,member,process.env.DISCORD_GUILD_ID)'));
  assert.ok(routes.includes("process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN!=='true'"));
});
test('FiveM ingestion may only create citizens after existing server authentication',()=>{
  const sourceFile=source('src/service-applications-routes.js');
  const check=sourceFile.indexOf('if(!safeCompare(supplied,secret))');
  const create=sourceFile.indexOf('citizenInitialData(discordId,');
  assert.ok(check>=0&&create>check);
  assert.ok(sourceFile.includes('citizenDossiersEnabled(process.env)'));
});
