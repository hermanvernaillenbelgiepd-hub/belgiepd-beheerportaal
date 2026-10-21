import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveServiceDossierDepartments,canReadServiceDossier} from '../src/service-dossier-access.js';

const guild='1309532438053130326';
const other='987654321098765432';
const now=Date.UTC(2026,9,21,22);
const member=roles=>({guildId:guild,roleIds:roles,verifiedAt:now-30000});
const actor=(dept,role='basiskader')=>({uid:'discord:'+other,discordId:other,role,
  departments:[dept],departmentRoles:{[dept]:role}});
const person=(dept,call,rank='Operationeel')=>({dept,personId:other,call,rank});
const derive=(who,roster=[],roles=[],board=null,m=member(roles))=>
  deriveServiceDossierDepartments(who,roster,m,board,guild,now);

test('Approved Bestuur sees all four dossiers regardless of police grade or membership',()=>{
  const who=actor('politie');
  assert.deepEqual(derive(who,[],[],{status:'approved',permissions:[]}),
    ['politie','ambulance','brandweer','depannage']);
  assert.deepEqual(derive(who,[],['1309532438082355251']),
    ['politie','ambulance','brandweer','depannage']);
  for(const status of ['pending','rejected','revoked'])
    assert.deepEqual(derive(who,[],[],{status,permissions:['board_registry_read']}),[]);
  assert.deepEqual(derive(who,[],['1309532438082355251'],null,
    {guildId:guild,roleIds:['1309532438082355251'],verifiedAt:now-16*60000}),[]);
  assert.deepEqual(derive(who,[],['1309532438082355251'],null,
    {guildId:'999999999999999999',roleIds:['1309532438082355251'],verifiedAt:now}),[]);
});

test('Only middle cadre, officers, and chief with police membership see police dossiers',()=>{
  for(const role of ['middenkader','officierenkader','korpsleiding']){
    assert.deepEqual(derive(actor('politie',role)),['politie']);
  }
  assert.deepEqual(derive(actor('politie','basiskader')),[]);
  assert.deepEqual(derive(actor('brandweer','korpsleiding')),[]);
  assert.deepEqual(derive({...actor('politie','korpsleiding'),departmentRoles:{politie:'basiskader'}}),[]);
});

test('Brandweer access requires uniquely identified ZONE function, never generic fire management',()=>{
  const who=actor('brandweer','korpsleiding');
  assert.deepEqual(derive(who,[person('brandweer','ZONE')]),['brandweer']);
  assert.deepEqual(derive(who,[person('brandweer','BW-1','ZONE Commandante')]),['brandweer']);
  assert.deepEqual(derive(who,[person('brandweer','ZONE-01')]),['brandweer']);
  for(const call of ['BW leiding','BWM-1','ZONELEIDER','ZONE-ABC']){
    assert.deepEqual(derive(who,[person('brandweer',call)]),[]);
  }
  assert.deepEqual(derive(who,[person('brandweer','ZONE'),person('brandweer','ZONE')]),[]);
  assert.deepEqual(derive(actor('politie','korpsleiding'),[person('brandweer','ZONE')]),['politie']);
});

test('Ambulance access requires DIRMED, HARTS, HVPK or HAMB in official personnel roster',()=>{
  const who=actor('ambulance','basiskader');
  for(const call of ['DIRMED','HARTS-1','HVPK','HAMB-3']){
    assert.deepEqual(derive(who,[person('ambulance',call)]),['ambulance']);
  }
  for(const call of ['AMB-3','VPK-5','ARTS-2','HARTSEN','DIRMEDIC']){
    assert.deepEqual(derive(who,[person('ambulance',call)]),[]);
  }
  assert.deepEqual(derive(who,[person('ambulance','ZW-1','HVPK')]),['ambulance']);
  assert.deepEqual(derive(who,[person('brandweer','DIRMED')]),[]);
});

test('Depannage access is exclusive to verified AWV or official Agentschap Wegen en Verkeer role',()=>{
  const who=actor('depannage','basiskader');
  assert.deepEqual(derive(who,[person('depannage','AWV-1')]),['depannage']);
  assert.deepEqual(derive(who,[person('depannage','DEP-2','Agentschap Wegen en Verkeer')]),['depannage']);
  assert.deepEqual(derive(who,[person('depannage','DEP-2')],['1309532438019706969']),['depannage']);
  assert.deepEqual(derive(who,[person('depannage','LSRA-1')]),[]);
  assert.deepEqual(derive(who,[person('depannage','FAST')]),[]);
  assert.deepEqual(derive(who,[],['1309532438019706969']),[]);
  assert.deepEqual(derive(actor('politie','middenkader'),[person('depannage','AWV-1')]),['politie']);
});

test('Server projection, not caller-supplied nickname or rank, decides dossier access',()=>{
  const who=actor('ambulance','korpsleiding');
  assert.deepEqual(derive({...who,name:'DIRMED',call:'DIRMED'}),[]);
  assert.deepEqual(derive({...who,dossierAllowedDepartments:['ambulance']}),[]);
  assert.equal(canReadServiceDossier(who,'ambulance'),false);
  assert.equal(canReadServiceDossier({...who,dossierAllowedDepartments:['ambulance']},'ambulance'),true);
  assert.equal(canReadServiceDossier({...who,dossierAllowedDepartments:['ambulance']},'politie'),false);
  assert.equal(canReadServiceDossier({...who,dossierAllowedDepartments:['ambulance']},'unknown'),false);
  assert.deepEqual(derive({...who,discordId:'niet-geverifieerd'},[person('ambulance','DIRMED')]),[]);
});
