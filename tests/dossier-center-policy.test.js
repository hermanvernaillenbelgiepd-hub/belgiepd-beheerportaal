import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierScopes,dossierOverviewRows,dossierTimelineEntry} from '../src/dossier-center-policy.js';
import {canReadPersonnelSubject} from '../src/personnel-editor-policy.js';
const id='123456789012345678';
const other='987654321098765432';
const person={dept:'politie',personId:id,name:'Inspecteur A',call:'P30',
  rank:'Inspecteur',status:'Actief',source:'google-sheets'};
const actor={role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},discordId:other,dossierAllowedDepartments:['politie']};
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
test('Reeks is alleen zichtbaar voor toegelaten politiedossiers en geeft geen extra dossierinzage',()=>{
  const scopes=dossierScopes(actor);
  const rows=dossierOverviewRows([
    {...person,series:'Reeks 2'},
    {...person,dept:'ambulance',series:'Reeks 1'}
  ],[],scopes);
  assert.equal(rows.length,1);
  assert.equal(rows[0].series,'Reeks 2');
  assert.equal(rows[0].canOpen,true);
  const both=dossierOverviewRows([
    {...person,series:'Reeks 1'},
    {...person,dept:'ambulance',series:'Reeks 1'}
  ],[],dossierScopes({...actor,departments:['politie','ambulance'],
    dossierAllowedDepartments:['politie','ambulance'],
    departmentRoles:{politie:'officierenkader',ambulance:'korpsleiding'}}));
  assert.equal(both.find(row=>row.dept==='ambulance').series,'');
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


test('One Discord identity has separate police and ambulance dossiers with isolated leadership access',()=>{
  const ambulanceRecord={...person,dept:'ambulance',call:'AMB-12',rank:'Ambulancier'};
  const ambulanceLead={role:'korpsleiding',departments:['ambulance'],
    departmentRoles:{ambulance:'korpsleiding'},discordId:other,dossierAllowedDepartments:['ambulance']};
  const policeLead={...actor};
  const bothRecords=[person,ambulanceRecord];
  const policeRows=dossierOverviewRows(bothRecords,[],dossierScopes(policeLead));
  const ambulanceRows=dossierOverviewRows(bothRecords,[],dossierScopes(ambulanceLead));
  assert.deepEqual(policeRows.map(p=>p.dept),['politie']);
  assert.deepEqual(ambulanceRows.map(p=>p.dept),['ambulance']);
  assert.equal(policeRows[0].call,'P30');
  assert.equal(ambulanceRows[0].call,'AMB-12');
  const authorizedBoth={role:'korpsleiding',departments:['politie','ambulance'],
    departmentRoles:{politie:'korpsleiding',ambulance:'korpsleiding'},discordId:other,dossierAllowedDepartments:['politie','ambulance']};
  const all=dossierOverviewRows(bothRecords,[],dossierScopes(authorizedBoth));
  assert.equal(all.length,2);
  assert.deepEqual(all.map(p=>p.dept),['ambulance','politie']);
  assert.ok(all.every(p=>p.discordId===id));
});

test('Korpsleiding-dossiers blijven afgeschermd voor andere kaders, ook met het Discord-ID',()=>{
  const leader={...person,rank:'Hoofdcommissaris',call:'S950'};
  assert.equal(canReadPersonnelSubject(actor,leader),false);
  assert.deepEqual(dossierOverviewRows([person,leader],[],dossierScopes(actor)).map(p=>p.rank),['Inspecteur']);
  const chief={...actor,uid:'discord:'+actor.discordId,role:'korpsleiding',discordPoliceRank:'korpsleiding',departmentRoles:{politie:'korpsleiding'}};
  assert.equal(canReadPersonnelSubject(chief,leader),true);
  const board={...actor,boardPersonnelAdmin:true};
  assert.equal(canReadPersonnelSubject(board,leader),true);
  assert.equal(canReadPersonnelSubject(actor,person),true);
});

test('Volledig personeelsblad bevat zes identiteitsvelden en de 3-koloms dossierindeling',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  for(const id of ['sheetCall','sheetRank','sheetName','sheetSeries','sheetStatus','sheetDiscordId',
    'ficheColleague','ficheEditor','registerTrainingQuick'])
    assert.ok(html.includes(id),id);
  assert.ok(html.includes('dossier-main-row'));
  assert.ok(html.includes('dossier-lower-row'));
  assert.ok(html.includes("right.append(makeTile('specialisaties'),makeTile('movements'),makeTile('training'))"));
  assert.ok(html.includes("lower.append(makeTile('basisNotes'),makeTile('observations'),makeTile('sanctions'))"));
  assert.ok(html.includes('const ficheMode='));
});
