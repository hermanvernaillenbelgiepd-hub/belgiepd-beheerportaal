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

test('exact API fallback only accepts guild-provided IDs and rejects outages',async()=>{
 const {exactApiDisplayRoles}=await import('../src/bpd-discord-users-display.js');
 const one='123456789012345678',two='123456789012345679';
 const proof={status:'ok',entries:new Map([[one,['1309532437977497699','1309532437977497699']]])};
 assert.deepEqual(exactApiDisplayRoles(proof,one),['1309532437977497699']);
 assert.equal(exactApiDisplayRoles(proof,two),null);
 assert.equal(exactApiDisplayRoles({...proof,status:'connection_failed'},one),null);
 assert.equal(exactApiDisplayRoles({status:'ok',entries:new Map([[one,['invalid']]])},one),null);
});
test('per-person verifier uses exact API fallback and cannot update portal rights',()=>{
 const src=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
 const start=src.indexOf("app.get('/api/organogram/specialty-check/");
 const end=src.indexOf("app.put('/api/organogram/ae-display/",start);
 const route=src.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(route,/exactApiDisplayRoles\(upstream,staff\.personId\)/);
 assert.match(route,/!live\.verified/);
 assert.match(route,/source:'bpd-users-api'/);
 assert.doesNotMatch(route,/tx\.set\(|db\.collection\('bpd_discord_auth'\)\.doc/);
});
