import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const nav=read('public/bpd-navigation.js');
const leave=read('public/verlofbeheer.html');
const server=read('src/server.js');

test('navigation reuses one safe, short-lived permissions view across pages',()=>{
 assert.match(nav,/const navCacheTtlMs=90\*1000/);
 const section=nav.slice(nav.indexOf('async function verifyIdentity(show)'),
  nav.indexOf('function watchUnreadLeaveReturns()'));
 assert.ok(section.indexOf('const saved=cachedNavView(user.uid)')<
   section.indexOf('const token=await user.getIdToken()'));
 assert.match(section,/if\(saved\)\{/);
 assert.match(section,/fetchView\('\/api\/dashboard\/admin-visibility'\)/);
 assert.match(section,/fetchView\('\/api\/member\/dashboard'\)/);
 assert.match(section,/fetchView\('\/api\/citizen-staff\/access'\)/);
 assert.match(section,/results\.every\(result=>result\.status<500\)/);
 assert.match(nav,/if\(!user\)\{clearNavView\(\)/);
 assert.doesNotThrow(()=>new Script(nav));
});

test('navigation cache contains only presentation flags, not tokens or identities',()=>{
 const start=nav.indexOf('  function saveNavView(');
 const end=nav.indexOf('  function clearNavView()',start);
 const segment=nav.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(segment,/dashboardProfile:/);
 assert.match(segment,/showAdvancedDashboard:/);
 assert.match(segment,/technicalCenterVisible:/);
 assert.doesNotMatch(segment,/Authorization|Bearer|idToken|roleIds|discordId|accessToken/i);
 assert.match(segment,/window\.sessionStorage\.setItem/);
});

test('leave module uses the central persistent Discord login without old Google status flicker',()=>{
 const script=/<script type="module">([\s\S]*?)<\/script>/.exec(leave)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new Function(script.replace(/^import [^\n]+;\s*$/gm,'')));
 assert.match(script,/a\.getApps\(\)\.length\?a\.getApp\(\):a\.initializeApp\(c\.firebaseConfig\)/);
 assert.match(script,/setupPortalLogin\(\{button:el\('login'\)/);
 assert.doesNotMatch(script,/el\('login'\)\.textContent=user\?'Afmelden':'Google aanmelden'/);
 assert.doesNotMatch(script,/Meld eerst aan via Google|Bevoegdheden controleren…/);
 assert.match(script,/if\(el\('feedback'\)\.textContent==='Verlofgegevens laden…'\)/);
 assert.match(script,/firebaseFns\.onAuthStateChanged\(firebaseAuth,async user=>/);
});

test('server still verifies Firebase bearer tokens, approved access and current Discord proof',()=>{
 assert.match(server,/getAuth\(\)\.verifyIdToken\(token\)/);
 assert.match(server,/verifiedDiscordIdentity\(verified,member,process\.env\.DISCORD_GUILD_ID\)/);
 assert.match(server,/if\s*\(!entry \|\| !Array\.isArray\(entry\.departments\)/);
 const oauth=read('src/discord-portal-access.js');
 assert.match(oauth,/DISCORD_PORTAL_MAX_AGE_MS=7\*24\*60\*60\*1000/);
 const policy=read('src/verified-police-cadre.js');
 assert.match(policy,/VERIFIED_CORPS_SESSION_MS=8\*60\*60\*1000/);
});