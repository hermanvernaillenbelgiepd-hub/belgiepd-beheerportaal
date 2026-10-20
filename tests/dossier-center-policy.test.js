import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierScopes,dossierOverviewRows,dossierTimelineEntry} from '../src/dossier-center-policy.js';
const id='123456789012345678';
const other='987654321098765432';
const person={dept:'politie',personId:id,name:'Inspecteur A',call:'P30',
  rank:'Inspecteur',status:'Actief',source:'google-sheets'};
const actor={role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},discordId:other};
test('Only existing authorized staff are discoverable',()=>{
  const scopes=dossierScopes(actor);
  assert.deepEqual(scopes.personnelDepartments,['politie']);
  assert.deepEqual(scopes.applicationDepartments,[]);
  const rows=dossierOverviewRows([person,{...person,dept:'ambulance'}],
    [{dept:'politie',discordId:other,username:'Candidate',status:'accepted'}],scopes);
  assert.equal(rows.length,1);
  assert.equal(rows[0].name,'Inspecteur A');
  assert.equal(rows[0].application,false);
  assert.equal(Object.hasOwn(rows[0],'motivation'),false);
  assert.deepEqual(dossierScopes({role:'basiskader',departments:['politie'],
    departmentRoles:{politie:'basiskader'}},{},{})
    .personnelDepartments,[]);
});
test('Invalid identity and duplicate staff records fail closed',()=>{
  const scopes=dossierScopes(actor);
  assert.deepEqual(dossierOverviewRows([{...person,personId:'invalid'}],[],scopes),[]);
  assert.throws(()=>dossierOverviewRows([person,person],[],scopes));
});
test('Timeline returns only approved audit fields',()=>{
  const event=dossierTimelineEntry({action:'promotion',previousRank:'Agent',
    newRank:'Inspecteur',reason:'Vastgelegd',privateToken:'KEEP PRIVATE',
    actorDiscordId:id,at:new Date('2026-10-20T11:00:00Z')},'loopbaan');
  assert.deepEqual(event,{kind:'loopbaan',action:'promotion',at:'2026-10-20T11:00:00.000Z',
    previousRank:'Agent',newRank:'Inspecteur',reason:'Vastgelegd',actorDiscordId:id});
  assert.equal(Object.hasOwn(event,'privateToken'),false);
});
test('Central dossier routes never fetch or reveal deleted citizen records',()=>{
  const routes=readFileSync(new URL('../src/dossier-center-routes.js',import.meta.url),'utf8');
  assert.equal(routes.includes('CITIZEN_COLLECTION'),false);
  assert.equal(routes.includes('SERVICE_APPLICATIONS_COLLECTION'),false);
  assert.equal(routes.includes('citizen:'),false);
  assert.ok(routes.includes('if(!p)return respond(res,404'));
});
