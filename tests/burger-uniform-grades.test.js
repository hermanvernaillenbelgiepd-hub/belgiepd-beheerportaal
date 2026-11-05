import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {BURGER_UNIFORM_GRADES,citizenUniformRank} from '../public/uniform-profile-policy.js';
import {BURGER_ROLE_IDS,citizenGroupsForRoles} from '../src/burger-organogram-projection.js';
import {validateComposition} from '../src/uniform-composition-routes.js';

const compose=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
const resolver=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
const code=readFileSync(new URL('../public/uniform-profile-policy.js',import.meta.url),'utf8');
const roles=readFileSync(new URL('../src/role-catalog.js',import.meta.url),'utf8');
const validDraft=selector=>({
 department:'burger',scope:'rank',selector,
 assets:{uniform:'burger_coat'},layers:{},reason:'Uniformbeheer voor Burger'
});
test('Burger atelier has only 3 correct grades and their verified roles',()=>{
 assert.deepEqual(BURGER_UNIFORM_GRADES.map(([code])=>code),['burgerraad','burger','burger_in_opleiding']);
 assert.deepEqual(BURGER_UNIFORM_GRADES.map(([,title])=>title),['Burgerraad','Burger','Burger in opleiding (BIO)']);
 assert.match(compose,/if\(dept\.value==='burger'\)return BURGER_UNIFORM_GRADES\.map/);
 assert.equal(BURGER_ROLE_IDS.trainee,'1398985105254650007');
 assert.equal(BURGER_ROLE_IDS.member,'1309532438019706966');
 assert.equal(BURGER_ROLE_IDS.council,'1492485336197234728');
 assert.match(roles,/\['1398985105254650007','Burger-IO'/);
});
test('verified citizen groups select BIO uniform without changing displayed personnel rank',()=>{
 const existing={dept:'burger',rank:'Burger'};
 const trainee={...existing,burgerGroups:citizenGroupsForRoles([BURGER_ROLE_IDS.trainee])};
 assert.equal(citizenUniformRank(trainee),'burger_in_opleiding');
 assert.equal(trainee.rank,'Burger');
 assert.equal(citizenUniformRank({...trainee,burgerGroups:['Burger']}),'burger');
 assert.equal(citizenUniformRank({...trainee,burgerGroups:['Burgerraad','Burger IO']}),'burgerraad');
 assert.equal(citizenUniformRank({dept:'burger',rank:'Burger IO'}),'burger_in_opleiding');
 assert.equal(citizenUniformRank({dept:'burger',rank:'Stagiair'}),'burger');
});
test('server rejects old or unrelated citizen uniform grades',()=>{
 for(const grade of ['burgerraad','burger','burger_in_opleiding']){
  assert.equal(validateComposition(validDraft(grade)).selector,grade);
 }
 for(const grade of ['stagiair','ambulancier','bio']){
  assert.throws(()=>validateComposition(validDraft(grade)),/geldige hulpdienst en graad/);
 }
});
test('presentation resolver uses verified citizen role for uniform composition',()=>{
 const script=resolver.replace(/^import\s+[^;]+;$/gm,'');
 const env={window:{},citizenUniformRank,getTier:()=>'',policeUniformGroup:()=>'',ambulanceFunction:()=>'',depannageFunction:()=>'',policeCallSeries:()=>''};
 runInNewContext(script,env);
 const uri='/api/role-artwork/file/uniform_burger_bio_uniform?v=1';
 env.window.BPDUniformAssignments.setData([],[
  {key:'uniform_burger_bio_uniform',imageUrl:uri}
 ],[],[],[{department:'burger',scope:'rank',selector:'burger_in_opleiding',
  assets:{uniform:'bio_uniform'},layers:{}}]);
 const result=env.window.BPDUniformAssignments.forPerson({
  dept:'burger',rank:'Burger',burgerGroups:['Burger IO'],call:'—'
 });
 assert.equal(result.uniformUrl,uri);
 assert.equal(result.uniformCode,'bio_uniform');
 const full=env.window.BPDUniformAssignments.forPerson({
  dept:'burger',rank:'Burger',burgerGroups:['Burger'],call:'—'
 });
 assert.equal(full.uniformUrl,'');
});
