import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseOrganogramRoleLinks} from '../src/bpd-discord-users-display.js';

const id1='123456789012345678',id2='123456789012345679';
const entry=(dept,id,call)=>({dept,personId:id,call,name:'Personeelslid'});
test('cross-service memberships count independently; no guessed identities',()=>{
 const upstream={status:'ok',entries:new Map([[id1,['123456789012345680']]])};
 const rows=[entry('politie',id1,'P400'),entry('brandweer',id1,'BWM-1'),
  entry('ambulance',id2,'AMB-1')];
 const report=diagnoseOrganogramRoleLinks(rows,upstream);
 assert.equal(report.stats.total,3);
 assert.equal(report.stats.matched,2);
 assert.equal(report.stats.missing,1);
 assert.equal(report.stats.duplicate,0);
 assert.deepEqual(report.issues.map(x=>x.personId),[id2]);
 assert.equal(JSON.stringify(report).includes('123456789012345680'),false,
  'raw external role IDs must not be exposed in a diagnostic');
});
test('ambiguous same-service Discord ID cannot be treated as linked',()=>{
 const upstream={status:'ok',entries:new Map([[id1,[]]])};
 const rows=[entry('brandweer',id1,'BWM-1'),entry('brandweer',id1,'BWM-2')];
 const report=diagnoseOrganogramRoleLinks(rows,upstream);
 assert.equal(report.stats.matched,0);
 assert.equal(report.stats.duplicate,2);
 assert.equal(report.issues.length,2);
});
test('API outage never marks people as absent',()=>{
 const report=diagnoseOrganogramRoleLinks([entry('politie',id1,'400')],
  {status:'rate_limited',entries:new Map()});
 assert.equal(report.status,'rate_limited');
 assert.equal(report.stats.missing,0);
 assert.equal(report.issues.length,0);
});
test('recognition never requires an uploaded image or grants access',()=>{
 const src=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const section=src.slice(src.indexOf('const roleChoices=new Map()'),
  src.indexOf('// An explicitly recorded AE display level'));
 assert.match(section,/verified\.has\(link\.roleId\)/);
 assert.doesNotMatch(section,/assetUrls|imageUrl/);
 assert.match(src,/app\.get\('\/api\/organogram\/discord-links\/admin',requireUser,manager/);
});

test('Depannage FAST and LSRA roles are recognized without artwork',async()=>{
 const {defaultSpecialtyRoleLinks}=await import('../src/specialty-role-presets.js');
 const links=defaultSpecialtyRoleLinks('depannage',[],false);
 assert.deepEqual(links.map(x=>[x.roleId,x.label]),[
  ['1309532438019706970','F.A.S.T'],
  ['1309532438019706971','LSRA']
 ]);
 assert.ok(links.every(x=>x.assetKey===''&&x.value==='Ja'));
});
