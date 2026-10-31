import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedOfficerCadre} from '../src/verified-police-cadre.js';
import {PERSONNEL_ROSTER_DEFAULT,validatePersonnelRosterLayout,savedPersonnelRosterLayout}
 from '../src/personnel-roster-layout-policy.js';
import {ROSTER_DEFAULT,ROSTER_PRESETS,parseRosterLayout,applyRosterLayout,rosterPresetName}
 from '../public/member-roster-layout.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const guild='123456789012345678',time=Date.UTC(2026,9,31,2,0,0);
const member=roles=>({guildId:guild,roleIds:roles,verifiedAt:time});
test('server and browser agree on conservative defaults',()=>{
 assert.deepEqual(PERSONNEL_ROSTER_DEFAULT,ROSTER_DEFAULT);
 assert.deepEqual(ROSTER_PRESETS.compact,ROSTER_DEFAULT);
 assert.deepEqual(savedPersonnelRosterLayout(undefined),ROSTER_DEFAULT);
 assert.deepEqual(parseRosterLayout(null),ROSTER_DEFAULT);
 assert.equal(rosterPresetName(ROSTER_PRESETS.ruim),'ruim');
});
test('only actual verified officer or corps Discord roles authorize changing dimensions',()=>{
 for(const roleId of ['1473474238664020151','1562710901080068229'])
  assert.ok(verifiedOfficerCadre(member([roleId]),guild,time));
 for(const roleIds of [
  [],['1335578488664490057'],['1353670078142615592'],['111111111111111111']
 ])assert.equal(verifiedOfficerCadre(member(roleIds),guild,time),null);
 assert.equal(verifiedOfficerCadre(member(['1562710901080068229']),
  '999999999999999999',time),null);
 assert.equal(verifiedOfficerCadre({...member(['1562710901080068229']),
  verifiedAt:time-25*3600*1000},guild,time),null);
 const api=read('src/member-dashboard-routes.js');
 assert.match(api,/canEditRosterLayout:!!verifiedOfficerCadre\(identity\.data\(\)/);
 assert.match(api,/app\.get\('\/api\/member\/personnel-layout',memberIdentity/);
 assert.match(api,/app\.put\('\/api\/member\/personnel-layout',memberIdentity/);
 assert.match(api,/if\(req\.memberPortal\.canEditRosterLayout!==true\)/);
 assert.match(api,/status\(403\)/);
 assert.match(api,/validatePersonnelRosterLayout\(req\.body\?\.layout\)/);
 assert.doesNotMatch(api,/canEditRosterLayout:.*callNumber/);
});
test('writes reject invalid keys, strings, fractions, negative values, oversized dimensions',()=>{
 assert.deepEqual(validatePersonnelRosterLayout({...ROSTER_DEFAULT}),ROSTER_DEFAULT);
 for(const changes of [
  {rowHeight:25},{rowHeight:65},{textSize:8},{insigniaWidth:200},
  {tableWidth:1100},{cellPadding:0},{nameColumn:600},
  {rankColumn:0},{textSize:'11'},{cellPadding:2.5}
 ])assert.throws(()=>validatePersonnelRosterLayout({...ROSTER_DEFAULT,...changes}));
 assert.throws(()=>validatePersonnelRosterLayout({...ROSTER_DEFAULT,evil:true}));
 assert.throws(()=>validatePersonnelRosterLayout({rowHeight:28}));
 assert.deepEqual(savedPersonnelRosterLayout({rowHeight:'not an integer'}),ROSTER_DEFAULT);
});
test('only authenticated, verified managers see size controls; all readers see saved CSS',()=>{
 const html=read('public/personeelslijst.html');
 const script=read('public/member-roster-layout.js');
 const server=read('src/server.js');
 assert.match(html,/id="rosterLayoutTools" hidden/);
 assert.match(html,/id="rosterLayoutSave" type="button" disabled/);
 assert.match(html,/type="range" min="26" max="64"/);
 assert.match(html,/rosterLayoutPanel/);
 assert.match(html,/from '\/member-roster-layout\.js/);
 assert.match(script,/tools\.hidden=!authorized/);
 assert.match(script,/authorized=data\.canEdit===true/);
 assert.match(script,/if\(!authorized\|\|!activeToken\)return/);
 assert.match(script,/function logoutRosterLayout/);
 assert.match(script,/if\(generation!==sessionGeneration\)return/);
 assert.match(server,/app\.use\('\/api\/member',express\.json\(\{limit:'3kb'/);
 assert.match(html,/--mr-custom-text-size/);
 assert.match(html,/--mr-custom-table-width/);
});
test('all controlled pixels can be applied without editing any member data',()=>{
 const values=new Map();
 const wrapper={style:{setProperty:(key,value)=>values.set(key,value)}};
 applyRosterLayout(wrapper,ROSTER_PRESETS.standard);
 assert.equal(values.get('--mr-custom-row-height'),'36px');
 assert.equal(values.get('--mr-custom-text-size'),'12px');
 assert.equal(values.get('--mr-custom-insignia-width'),'40px');
 assert.equal(values.get('--mr-custom-table-width'),'1520px');
 assert.equal(values.get('--mr-custom-name-column'),'176px');
 assert.equal(values.get('--mr-custom-rank-column'),'192px');
 assert.equal(values.get('--mr-custom-cell-padding'),'5px');
});
