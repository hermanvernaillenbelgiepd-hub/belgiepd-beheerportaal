import test from 'node:test';
import assert from 'node:assert/strict';
import {personnelPingScopes} from '../src/personnel-ping-scope-policy.js';
import {restrictedRosterMentionEntries,publicPoliceRoster} from '../src/member-dashboard-routes.js';
const guild='999999999999999999',now=Date.now();
const id='111111111111111111';
const actor=(dept,role='basiskader')=>({
 uid:'discord:'+id,discordId:id,role,departments:[dept],departmentRoles:{[dept]:role}
});
const proof=(...roleIds)=>({guildId:guild,verifiedAt:now,roleIds});
const scope=(a,roles)=>personnelPingScopes(a,proof(...roles),guild,now);
test('technical signed profile and verified police officer see every service',()=>{
 const tech={...actor('politie','beheerder'),portalTechnicalMode:true,profileTechnicalAvailable:true};
 assert.equal(personnelPingScopes(tech,null,guild,now).all,true);
 assert.deepEqual(personnelPingScopes({...tech,profileTechnicalAvailable:false},null,guild,now).departments,[]);
 assert.equal(scope({...actor('politie','officierenkader'),discordRosterEditorVerified:true},
  ['1473474238664020151']).all,true);
 assert.equal(scope({...actor('politie','korpsleiding'),discordRosterEditorVerified:true},
  ['1562710901080068229']).all,true);
 assert.equal(scope({...actor('politie','officierenkader'),discordRosterEditorVerified:false},
  ['1473474238664020151']).all,false);
});
test('middle cadre, instructors, fire, AZLS, AWV and Burgerraad get only verified service scope',()=>{
 const cases=[
  ['politie','middenkader','1335578488664490057'],
  ['politie','basiskader','1345302115689431061'],
  ['brandweer','middenkader','1554906632897560787'],
  ['brandweer','basiskader','1395115819020714105'],
  ['brandweer','basiskader','1309532437952466989'],
  ['ambulance','basiskader','1309532438053130325'],
  ['ambulance','basiskader','1309532437952466988'],
  ['depannage','basiskader','1309532438019706969'],
  ['burger','basiskader','1492485336197234728']
 ];
 for(const [dept,role,roleId] of cases){
  assert.deepEqual(scope(actor(dept,role),[roleId]),{all:false,departments:[dept]},dept);
  assert.deepEqual(scope(actor(dept,role),[]).departments,[],dept+' without role');
 }
 assert.deepEqual(scope(actor('ambulance'),['1309532438019706969']).departments,[]);
 assert.deepEqual(personnelPingScopes(actor('politie','middenkader'),{
  ...proof('1335578488664490057'),verifiedAt:now-25*60*60*1000
 },guild,now).departments,[]);
 assert.deepEqual(personnelPingScopes({ ...actor('politie'),uid:'discord:222222222222222222'},
  proof('1335578488664490057'),guild,now).departments,[]);
});
test('service-only scopes cannot enumerate another service or public Discord IDs',()=>{
 const make=(dept,discordId,name,call)=>({dept,personId:discordId,name,call,rank:'Inspecteur',status:'Actief',series:'Reeks 1',specialties:[]});
 const source=[
  make('politie','111111111111111111','A','300'),
  make('ambulance','222222222222222222','B','HAMB02'),
  make('brandweer','333333333333333333','C','OOF12'),
  make('politie','222222222222222222','B','400')
 ];
 assert.deepEqual(restrictedRosterMentionEntries(source),[]);
 const restricted=restrictedRosterMentionEntries(source,{all:false,departments:['ambulance']});
 assert.deepEqual(restricted.map(x=>x.discordId),['222222222222222222']);
 assert.equal(restricted[0].call,'400'); // Uses general-roster police identity
 assert.ok(publicPoliceRoster(source).every(x=>!Object.hasOwn(x,'discordId')));
});
