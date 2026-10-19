import test from 'node:test';
import assert from 'node:assert/strict';
import {dossierScopes,dossierOverviewRows,dossierTimelineEntry} from '../src/dossier-center-policy.js';

const id='123456789012345678',id2='987654321098765432';
const staff={dept:'ambulance',personId:id,name:'Kandidaat A',call:'A15',
  rank:'Ambulancier',status:'In opleiding',source:'firestore-created'};
const app={dept:'ambulance',discordId:id,username:'Kandidaat A',
  status:'submitted',motivation:'Persoonlijke motivatie (niet in overzichten)'};
test('Scopes never inherit permissions from another department',()=>{
  const actor={role:'officierenkader',departments:['politie','ambulance'],
    departmentRoles:{politie:'officierenkader',ambulance:'middenkader'},discordId:id2};
  const scopes=dossierScopes(actor,true);
  assert.deepEqual(scopes.personnelDepartments,['politie','ambulance']);
  assert.deepEqual(scopes.applicationDepartments,[]);
  assert.deepEqual(dossierScopes(actor,false).applicationDepartments,[]);
  assert.deepEqual(dossierScopes({role:'basiskader',departments:['ambulance'],
    departmentRoles:{ambulance:'basiskader'}},true),
    {personnelDepartments:[],applicationDepartments:[]});
});
test('Staff viewers cannot discover applicants without service review rights',()=>{
  const actor={role:'middenkader',departments:['ambulance'],
    departmentRoles:{ambulance:'middenkader'},discordId:id2};
  const scopes=dossierScopes(actor,true);
  const rows=dossierOverviewRows([staff],
    [app,{...app,discordId:id2,username:'Privékandidaat'}],scopes);
  assert.equal(rows.length,1);
  assert.equal(rows[0].personnel,true);
  assert.equal(rows[0].application,false);
  assert.equal(Object.hasOwn(rows[0],'motivation'),false);
});
test('High cadre may view application and linked staff in same service only',()=>{
  const actor={role:'korpsleiding',departments:['ambulance'],
    departmentRoles:{ambulance:'korpsleiding'},discordId:id2};
  const scopes=dossierScopes(actor,true);
  const rows=dossierOverviewRows([staff,{...staff,dept:'politie'}],
    [app,{...app,dept:'brandweer'}, {...app,discordId:id2,username:'Andere kandidaat'}],scopes);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.dept),['ambulance','ambulance']);
  assert.equal(rows[0].personnel||rows[1].personnel,true);
  const merged=rows.find(r=>r.discordId===id);
  assert.equal(merged.application,true);
  assert.equal(merged.personnel,true);
  assert.equal(merged.applicationStatus,'submitted');
  assert.equal(Object.hasOwn(merged,'motivation'),false);
  assert.equal(Object.hasOwn(merged,'decisionReason'),false);
});
test('Invalid IDs and duplicates never produce ambiguous records',()=>{
  const scopes={personnelDepartments:['ambulance'],applicationDepartments:['ambulance']};
  assert.deepEqual(dossierOverviewRows([{...staff,personId:'bogus'}],[],scopes),[]);
  assert.throws(()=>dossierOverviewRows([staff,staff],[],scopes));
  assert.throws(()=>dossierOverviewRows([],[app,app],scopes));
});
test('Timeline never returns arbitrary nested audit details',()=>{
  const e=dossierTimelineEntry({action:'promotion',previousRank:'Agent',
    newRank:'Aspirant Inspecteur',reason:'Gedocumenteerde beslissing',
    privateToken:'DO NOT SHARE',actorDiscordId:id,at:new Date('2026-10-19T20:00:00Z')},'loopbaan');
  assert.deepEqual(e,{kind:'loopbaan',action:'promotion',
    at:'2026-10-19T20:00:00.000Z',previousRank:'Agent',newRank:'Aspirant Inspecteur',
    reason:'Gedocumenteerde beslissing',actorDiscordId:id});
  assert.equal(Object.hasOwn(e,'privateToken'),false);
});
