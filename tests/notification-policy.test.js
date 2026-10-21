import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFortnight,periodAt,periodsForActor,monthlyActivityStatus,
  policeSeriesHeads,policeScope,warningFor,normalizeSeries,subjectPoliceGrade,leaveAuthority,afterLeave} from '../src/notification-policy.js';
import {mayApproveLeave} from '../src/leave-policy.js';
const alice='111111111111111111',bob='222222222222222222';
const actor=role=>({discordId:alice,role,departments:['politie'],departmentRoles:{politie:role}});
const leave={personDiscordId:bob,subjectDepartments:['politie'],status:'pending',
  startDate:'2026-10-20',endDate:'2026-11-19',days:31};
test('Every fortnight starts Monday, lasts 14 days, previous remains available',()=>{
  assert.deepEqual(currentFortnight('2026-10-21'),{start:'2026-10-19',end:'2026-11-01',days:14});
  assert.deepEqual(currentFortnight('2026-11-02'),{start:'2026-11-02',end:'2026-11-15',days:14});
  assert.deepEqual(currentFortnight('2026-10-18'),{start:'2026-10-05',end:'2026-10-18',days:14});
  assert.throws(()=>periodAt('2026-10-20'),/maandag/);
  assert.deepEqual(periodsForActor('2026-10-21',actor('middenkader')).map(x=>x.start),['2026-10-19','2026-10-05']);
  assert.equal(periodsForActor('2026-10-21',actor('officierenkader')).length,27);
  assert.equal(periodsForActor('2026-10-21',actor('basiskader')).length,0);
});
test('Monthly activity uses VERIFIED calendar-month hours, strictly above 20 active',()=>{
  for(const [hours,want] of [[0,'Inactief'],[10,'Inactief'],[10.01,'50/50'],[11,'50/50'],[20,'50/50'],[20.01,'Actief'],[100,'Actief']])
    assert.equal(monthlyActivityStatus(hours),want);
  for(const hours of [null,undefined,-1,'15',NaN])assert.equal(monthlyActivityStatus(hours),null);
});
test('Three series remain individually assigned to named reekshoofden',()=>{
  const config=policeSeriesHeads({BPD_POLICE_SERIES_HEADS_JSON:JSON.stringify({'1':[alice],'2':[bob],'3':[]})});
  assert.deepEqual(policeScope(actor('middenkader'),config).series,['1']);
  assert.deepEqual(policeScope({...actor('middenkader'),discordId:'333333333333333333'},config).series,[]);
  assert.deepEqual(policeScope(actor('officierenkader'),config).series,['1','2','3']);
  assert.deepEqual(policeScope({...actor('korpsleiding'),departmentRoles:{politie:'basiskader'}},config).series,[]);
  assert.deepEqual(policeScope(actor('basiskader'),config).series,[]);
  assert.equal(normalizeSeries({seriesRaw:'2'}),'2');
  assert.equal(normalizeSeries({series:'Reeks 3'}),'3');
  assert.equal(normalizeSeries({series:'Kader'}),null);
  const staged=policeSeriesHeads({BPD_POLICE_SERIES_HEADS_JSON:'not-json'});
  assert.deepEqual(staged['1'],['622486684033875968','1041812771349737614','949115181785563137','962410307463049236','947114717724413952']);
  assert.deepEqual(staged['2'],['729410384095871098','305021081243090944','298799630458552323']);
  assert.deepEqual(staged['3'],[
    '1103170819355574328','1222286882331824208',
    '344065695635734528','1171128215708909602'
  ],'Confirmed Jones, Roy, J.Eclaire and Seba are heads of series 03');
  assert.equal(staged['1'].includes('947114717724413952'),true,'Dieter now has confirmed series 01 identity');
  assert.equal(staged['2'].includes('298799630458552323'),true,'Unemi has distinct series 02 identity');
  assert.equal(staged['2'].includes('947114717724413952'),false);
  assert.deepEqual(policeScope({...actor('middenkader'),discordId:'528568826481344522'},staged).series,['1','2','3'],'Rx supports all series');
  assert.deepEqual(policeScope({...actor('basiskader'),discordId:'528568826481344522'},staged).series,[],'Butterfly assignment never grants a higher rank');
  for(const id of staged['3'])
    assert.deepEqual(policeScope({...actor('middenkader'),discordId:id},staged).series,['3'],
      'Series 03 heads only receive their own series');
  assert.deepEqual(policeScope({...actor('middenkader'),discordId:'947114717724413952'},staged).series,['1'],
    'Dieter has only series 01 access');
  assert.deepEqual(policeScope({...actor('middenkader'),discordId:'298799630458552323'},staged).series,['2'],
    'Unemi has only series 02 access');
  assert.deepEqual(policeScope({...actor('basiskader'),discordId:'1103170819355574328'},staged).series,[],
    'Series assignment does not grant a police cadre role');
  assert.equal(normalizeSeries({seriesRaw:'01'}),'1');
  assert.equal(normalizeSeries({series:'Reeks 03'}),'3');
  const legacyConfig=policeSeriesHeads({BPD_POLICE_SERIES_HEADS_JSON:JSON.stringify({
    '1':['947114717724413952','1103170819355574328'],
    '2':['1171128215708909602'],
    '3':[]
  })});
  assert.deepEqual(legacyConfig['1'],staged['1'],'Dieter remains series 01, and confirmed series 03 IDs cannot move there');
  assert.deepEqual(legacyConfig['2'],staged['2'],'Confirmed series 03 IDs cannot be routed to series 02');
  assert.deepEqual(legacyConfig['3'],staged['3'],'Confirmed series 03 works despite stale Render overrides');
});
test('Inactivity alerts persist after threshold; leave suppresses alert',()=>{
  for(const [days,expect] of [[11,null],[12,12],[14,12],[15,12],[26,12],[27,27],[31,27],[56,27],[57,57],[61,57],[90,57]])
    assert.equal(warningFor({dept:'politie',status:'Actief',last:days})?.warn||null,expect);
  assert.equal(warningFor({dept:'politie',status:'Verlof',last:61}),null);
  assert.equal(warningFor({dept:'politie',status:'Actief',last:null}),null);
});
test('Police rank-based leave: chief registers, middle requests higher cadre, officer >30 chief only',()=>{
  const base={dept:'politie',personId:bob,rank:'Agent'};
  const officer={...base,rank:'Aspirant Commissaris'};
  const chief={...base,rank:'Commissaris'};
  const mid={...base,rank:'Hoofdinspecteur'};
  assert.equal(subjectPoliceGrade(base),'basiskader');
  assert.equal(subjectPoliceGrade(officer),'officierenkader');
  assert.equal(subjectPoliceGrade(chief),'korpsleiding');
  assert.equal(subjectPoliceGrade(mid),'middenkader');
  assert.equal(leaveAuthority(actor('middenkader'),leave,mid),false);
  assert.equal(leaveAuthority(actor('officierenkader'),leave,mid),true);
  assert.equal(leaveAuthority(actor('officierenkader'),leave,officer),false);
  assert.equal(leaveAuthority(actor('korpsleiding'),leave,officer),true);
  assert.equal(leaveAuthority(actor('korpsleiding'),leave,chief),false);
  assert.equal(mayApproveLeave(actor('middenkader'),{...leave,subjectPoliceGrade:'middenkader'},null,'2026-10-19'),false);
  assert.equal(mayApproveLeave(actor('officierenkader'),{...leave,subjectPoliceGrade:'middenkader'},null,'2026-10-19'),true);
  assert.equal(mayApproveLeave(actor('officierenkader'),{...leave,subjectPoliceGrade:'officierenkader'},null,'2026-10-19'),false);
  assert.equal(mayApproveLeave(actor('korpsleiding'),{...leave,subjectPoliceGrade:'officierenkader'},null,'2026-10-19'),true);
  assert.equal(mayApproveLeave(actor('korpsleiding'),{...leave,subjectPoliceGrade:'korpsleiding'},null,'2026-10-19'),false);
  assert.equal(afterLeave({status:'approved',endDate:'2026-10-20',subjectDepartments:['politie']},'2026-10-21'),true);
  assert.equal(afterLeave({status:'approved',endDate:'2026-10-21',subjectDepartments:['politie']},'2026-10-21'),false);
});
test('Notifications are registered as protected routes; no Sheets mutations or automatic removals',()=>{
  const route=readFileSync(new URL('../src/notification-routes.js',import.meta.url),'utf8');
  assert.ok(route.includes('app.get(\'/api/notifications/me\',requireUser'));
  assert.ok(route.includes('runTransaction(async tx=>'));
  assert.ok(route.includes('bpd_weekreport_events'));
  assert.ok(!route.includes('spreadsheets.values.update'));
  assert.ok(!route.includes('delete('));
  const main=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.ok(main.includes('installNotificationRoutes(app,{requireUser,getSnapshot})'));
});
