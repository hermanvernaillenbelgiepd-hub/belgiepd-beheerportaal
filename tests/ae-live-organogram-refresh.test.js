import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
test('known AE members get bounded live guild verification instead of a login snapshot',()=>{
 assert.match(server,/const aeCandidates=prepared\.filter/);
 assert.match(server,/verifyLiveSpecialtyRoles\(memberId\)/);
 assert.match(server,/merged\.aeTeamleader=currentAE\.aeTeamleader/);
 assert.match(server,/liveAE\.has\(p\.personId\)/);
 assert.match(server,/AE_MANUAL_LEVELS\.has\(chosenAE\)/);
});
test('AE Teamleader patch is matched by exact role ID, never generic AE member badge',()=>{
 assert.match(server,/roleId:x\.roleId\|\|''/);
 assert.match(server,/roleId:link\.roleId/);
 assert.match(server,/linkPriority\(link\)>linkPriority\(chosen\)/);
 assert.match(html,/!aeSpecific\|\|entry\.roleId===aeRoleIds\[functionVariant\]/);
 assert.match(html,/ae-level-text-patch/);
 assert.match(html,/render\(\); \/\/ Update AE Teamleader group/);
});
