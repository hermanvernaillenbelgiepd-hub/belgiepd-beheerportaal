import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {verifiedK9DisplayRole,effectiveK9DisplayRole,K9_ROLE_IDS} from '../src/k9-display-role.js';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const oldPath=new URL('../public/assets/k9-specialisatie-patch-20261029.webp',import.meta.url);
const currentPath=new URL('../public/assets/k9-patches-geborduurd-20261029.webp',import.meta.url);
const guild='987654321098765432',now=Date.now();
const identity=(...roleIds)=>({guildId:guild,verifiedAt:now,roleIds});

test('the legacy K9 picture is deleted and never referenced by the public organogram',()=>{
 assert.equal(existsSync(oldPath),false);
 assert.equal(html.includes('k9-specialisatie-patch-20261029.webp'),false);
 assert.equal(html.includes('K9 pilot: originele aangeleverde specialisatiepatch'),false);
 assert.equal(existsSync(currentPath),true);
 assert.match(html,/background-image:url\('\/assets\/k9-patches-geborduurd-20261029\.webp'\)/);
});

test('K9 role labels and matching embroidered stripes have only three confirmed roles',()=>{
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.match(script,/const role=p\.k9Role;/);
 assert.doesNotMatch(script,/const role=p\.k9Role\|\|/);
 assert.match(script,/Object\.hasOwn\(roleLabels,role\)/);
 assert.match(script,/item\.classList\.add\('k9-role-unverified'\)/);
 assert.match(script,/K9-functie niet bevestigd/);
 assert.match(html,/k9-patch-instructeur\{background-position:50% 0%\}/);
 assert.match(html,/k9-patch-geleider\{background-position:50% 50%\}/);
 assert.match(html,/k9-patch-geleider_in_stage\{background-position:50% 100%\}/);
});

test('Discord priority instructor > handler > stage with manual officer/corps override',()=>{
 assert.deepEqual(K9_ROLE_IDS,{
  instructeur:'1345302115689431061',
  geleider:'1309532437977497699',
  geleider_in_stage:'1345297414612979713'
 });
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.instructeur,K9_ROLE_IDS.geleider,K9_ROLE_IDS.geleider_in_stage),guild,now),'instructeur');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider,K9_ROLE_IDS.geleider_in_stage),guild,now),'geleider');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider),guild,now),'geleider');
 assert.equal(verifiedK9DisplayRole(identity(K9_ROLE_IDS.geleider_in_stage),guild,now),'geleider_in_stage');
 assert.equal(verifiedK9DisplayRole(identity(),guild,now),'');
 assert.equal(effectiveK9DisplayRole('geleider_in_stage','geleider'),'geleider_in_stage');
});
