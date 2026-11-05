import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const start=html.indexOf('function policeInterventionPatchFromManifest(');
const end=html.indexOf('function roleArtworkUrl(',start);
assert.ok(start>=0&&end>start,'Interventie fallback helper must exist');
const select=runInNewContext(html.slice(start,end)+
  '\npoliceInterventionPatchFromManifest');

test('registered police INTERVENTIE library patch is used on the profile',()=>{
 const url='/api/role-artwork/file/specialty_politie_interventie?v=abc123';
 assert.equal(select([{key:'specialty_politie_interventie',imageUrl:url}]),url);
 assert.match(html,/policeInterventionBadgeUrl=policeInterventionPatchFromManifest/);
 assert.match(html,/name==='INTERVENTIEDIENST'\?policeInterventionBadgeUrl/);
});

test('never use a non-police or untrusted badge URL',()=>{
 assert.equal(select([{key:'specialty_brandweer_interventie',imageUrl:'/bad'}]),'');
 assert.equal(select([{key:'specialty_politie_interventie',imageUrl:'https://other.site/patch'}]),'');
 assert.equal(select([{key:'specialty_politie_interventie',imageUrl:'/api/role-artwork/file/specialty_politie_rago?v=1'}]),'');
 assert.equal(select([]),'');
});
