import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validReturnTo} from '../src/discord-utils.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('TO-dienstbord is een veilige terugkeerpagina na Discord OAuth',()=>{
  assert.equal(validReturnTo('/to-dienstbord.html'),'/to-dienstbord.html');
  assert.equal(validReturnTo('/discord-status.html'),'/discord-status.html');
  assert.equal(validReturnTo('//discord.com/attacker'),'/discord-status.html');
  assert.equal(validReturnTo('https://untrusted.example/'),'/discord-status.html');
  const page=read('../public/discord-status.html');
  assert.match(page,/\'\/to-dienstbord\.html\'/);
  assert.match(page,/if\(verified&&safe\.has\(returnTo\)\)location\.replace\(returnTo\)/);
});

test('OAuth start-cookie verliest geldigheid niet bij gewone Render restart',()=>{
  const server=read('../src/discord-oauth.js');
  assert.match(server,/createHmac\('sha256',config\(\)\.secret/);
  assert.match(server,/belgiepd-discord-oauth-state-cookie-v1/);
  assert.doesNotMatch(server,/const cookieKey=randomBytes\(32\)/);
  assert.match(server,/code_challenge_method','S256'/);
  assert.match(server,/SameSite=Lax/);
});

test('Portaal laat wisselen van Google naar Discord zonder rechtenverhoging',()=>{
  const ui=read('../public/portal-login.js');
  assert.match(ui,/refresh\.textContent=user\?\.uid\?\.startsWith\('discord:'\)/);
  assert.match(ui,/Aanmelden met Discord/);
  assert.match(ui,/auth\/discord\/start/);
  const server=read('../src/server.js');
  assert.match(server,/verifiedDiscordIdentity\(verified,member,process\.env\.DISCORD_GUILD_ID\)/);
});

test('TO hernieuwt eenmalig 401-token, niet bij 403',()=>{
  const ui=read('../public/to-dienstbord.js');
  assert.match(ui,/if\(response\.status===401\).*execute\(true\)/);
  assert.doesNotMatch(ui,/if\(response\.status===403\).*execute\(true\)/);
  const oauth=read('../src/discord-oauth.js');
  assert.match(oauth,/Portaalsessie verlopen of ongeldig/);
  assert.match(oauth,/Discord-profiel tijdelijk niet beschikbaar/);
});
