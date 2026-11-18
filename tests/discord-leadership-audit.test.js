import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leadershipRoleDifference} from '../src/discord-leadership-audit.js';
const guild='123456789012345678',id='223456789012345678',now=1800000000000;
const account=(dept,role)=>({status:'approved',discordId:id,
 departments:[dept],departmentRoles:{[dept]:role}});
const member=roles=>({guildId:guild,verifiedAt:now-60000,roleIds:roles});
test('mismatched police cadre can be reviewed, never auto-promoted',()=>{
 assert.equal(leadershipRoleDifference(account('politie','middenkader'),
  member(['1335578488664490057']),guild,now),null);
 const found=leadershipRoleDifference(account('politie','middenkader'),
  member(['1473474238664020151']),guild,now);
 assert.equal(found[0].status,'different');
 assert.equal(found[0].expected,'middenkader');
 assert.equal(found[0].actual,'officierenkader');
});
test('outdated Discord roles are marked stale, not treated as proof',()=>{
 const row=leadershipRoleDifference(account('politie','korpsleiding'),
  {...member(['1562710901080068229']),verifiedAt:now-60*60000},guild,now);
 assert.equal(row.status,'stale');
 assert.equal(leadershipRoleDifference({...account('politie','middenkader'),
  status:'blocked'},member(['1335578488664490057']),guild,now),null);
});
test('other services cannot use Police role as proof of their own leadership',()=>{
 const row=leadershipRoleDifference(account('ambulance','officierenkader'),
  member(['1473474238664020151']),guild,now);
 assert.equal(row[0].status,'needs_review');
 assert.equal(row[0].department,'ambulance');
 assert.equal(leadershipRoleDifference(account('depannage','korpsleiding'),
  member(['1309532438019706969']),guild,now),null);
});
test('live differences are only visible on the signed technical MAIN diagnostic endpoint',()=>{
 const routes=readFileSync(new URL('../src/discord-role-diagnostics-routes.js',import.meta.url),'utf8');
 assert.match(routes,/diagnosisAccess\(req\.bpd\)/);
 assert.match(routes,/discordDiagnosticsMainOnly\(env\)/);
});
