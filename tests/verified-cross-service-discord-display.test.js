import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedSyncRoles,mergePlacement} from '../src/organogram-placement-policy.js';

const guild='1309532438053130324',now=Date.UTC(2026,10,3,5);
const proof=roleIds=>({guildId:guild,verifiedAt:now,roleIds});
const RAGO='1309532437977497700',RAGO_IO='1490841316656156802';
const FAST='1309532438019706970',LSRA='1309532438019706971';
const FIRE='1309532438053130324';

test('cross-service Discord roles resolve only within each own service',()=>{
 const member=proof([RAGO,FAST,LSRA,FIRE]);
 const expected={brandweer:[],politie:['RAGO'],depannage:['F.A.S.T','LSRA'],ambulance:[]};
 for(const [dept,want] of Object.entries(expected)){
  const auto=verifiedSyncRoles(member,dept,guild,now);
  assert.deepEqual(auto.specialties,want);
  const subject={dept,personId:guild,call:'TEST',name:'Testlid',rank:'',specialties:[]};
  assert.deepEqual(mergePlacement(subject,null,auto).specialties,want);
 }
});

test('Brandweer membership never implies another service or training certificate',()=>{
 const member=proof([FIRE,RAGO,FAST,LSRA]);
 assert.deepEqual(verifiedSyncRoles(member,'brandweer',guild,now).specialties,[]);
 const subject={dept:'brandweer',personId:guild,call:'BWM-07',
  name:'Testlid',rank:'Brandweerman',specialties:[{label:'Basis TR',value:'Ja'}]};
 assert.deepEqual(mergePlacement(subject,null,verifiedSyncRoles(member,'brandweer',guild,now)).specialties,[]);
 assert.deepEqual(verifiedSyncRoles(proof([RAGO_IO]),'politie',guild,now).specialties,['RAGO-IO']);
});

test('operational profiles and API never transmit roles from other departments',()=>{
 const routes=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.doesNotMatch(routes,/otherServiceRoles|verifiedOtherServiceDiscordRoles/);
 assert.doesNotMatch(page,/otherServiceRoles|Discord-functies bij andere diensten/);
 assert.match(routes,/completedFireBasicTraining:registeredFireBasicTraining\(p\)/);
 assert.match(page,/Afgeronde opleidingen/);
});
