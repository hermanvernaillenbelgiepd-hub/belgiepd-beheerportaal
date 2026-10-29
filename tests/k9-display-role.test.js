import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditK9Display,verifiedK9DisplayRole,validManualK9Role,
 effectiveK9DisplayRole,K9_ROLE_IDS} from '../src/k9-display-role.js';

const guild='123456789012345678';
const now=1761700000000;
const identity=(...roles)=>({guildId:guild,verifiedAt:now,roleIds:roles});
const actor=(role,departmentRole=role)=>({
 uid:'discord:111111111111111111',discordId:'111111111111111111',
 role,departments:['politie'],departmentRoles:{politie:departmentRole}
});
test('K9 role permission is strictly police officer/command scoped',()=>{
 assert.equal(canEditK9Display(actor('officierenkader')),true);
 assert.equal(canEditK9Display(actor('korpsleiding')),true);
 assert.equal(canEditK9Display(actor('beheerder','korpsleiding')),true);
 assert.equal(canEditK9Display(actor('middenkader')),false);
 assert.equal(canEditK9Display(actor('basiskader')),false);
 assert.equal(canEditK9Display({role:'officierenkader',departments:['ambulance']}),false);
 assert.equal(canEditK9Display({...actor('officierenkader'),uid:'discord:222222222222222222'}),false);
});
test('verified K9 roles prioritize instructor, full handler, then trainee',()=>{
 assert.deepEqual(K9_ROLE_IDS,{
  instructeur:'1345302115689431061',
  geleider:'1309532437977497699',
  geleider_in_stage:'1345297414612979713'
 });
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider),guild,now),'geleider');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider_in_stage),guild,now),'geleider_in_stage');
 // Volwaardige K9-leden behouden soms de opleidingsrol K9-IO.
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider,K9_ROLE_IDS.geleider_in_stage),guild,now),'geleider');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider_in_stage,K9_ROLE_IDS.geleider),guild,now),'geleider');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.instructeur,K9_ROLE_IDS.geleider,K9_ROLE_IDS.geleider_in_stage),guild,now),'instructeur');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider,K9_ROLE_IDS.instructeur),guild,now),'instructeur');
 assert.equal(verifiedK9DisplayRole({...identity(K9_ROLE_IDS.instructeur),guildId:'999999999999999999'},guild,now),'');
 assert.equal(verifiedK9DisplayRole({...identity(K9_ROLE_IDS.instructeur),verifiedAt:now-8*86400000},guild,now),'');
});
test('manual override wins and clearing it returns to verified Discord',()=>{
 assert.equal(effectiveK9DisplayRole('geleider_in_stage','instructeur'),'geleider_in_stage');
 assert.equal(effectiveK9DisplayRole('','geleider'),'geleider');
 assert.equal(effectiveK9DisplayRole('bad','instructeur'),'instructeur');
 assert.equal(validManualK9Role({role:'geleider',reason:'Correctie K9 rol'}).role,'geleider');
 assert.throws(()=>validManualK9Role({role:'onbekend',reason:'Correctie K9 rol'}));
 assert.throws(()=>validManualK9Role({role:'geleider',reason:'kort'}));
 assert.throws(()=>validManualK9Role({role:'geleider',reason:'Correctie K9 rol',isAdmin:true}));
});
