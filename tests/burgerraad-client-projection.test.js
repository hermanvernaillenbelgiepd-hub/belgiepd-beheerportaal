import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serviceHierarchy,getTier} from '../public/assets/organogram-hierarchie-model.js';
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const citizen=(name,burgerGroups,leadershipTier='none')=>({
 dept:'burger',name,call:'—',rank:'Burger',burgerGroups,leadershipTier
});
test('Burgerraad Discord role survives browser-side organogram normalization',()=>{
 assert.match(html,/burgerGroups:p\.dept==='burger'&&Array\.isArray\(p\.burgerGroups\)/);
 assert.match(html,/p\.burgerGroups\.filter\(x=>\['Burgerraad','Burger','Burger IO'\]\.includes\(x\)\)/);
});
test('Verified Burgerraad is placed before Burger and Burger IO even with stale manual tier',()=>{
 const people=[
  citizen('Gewone burger',['Burger']),
  citizen('Raadslid',['Burgerraad','Burger'],'Burger'),
  citizen('Lid in opleiding',['Burger IO'])
 ];
 assert.equal(getTier(people[1]),'Burgerraad');
 const chart=serviceHierarchy(people,'burger');
 assert.deepEqual(chart.leadership.map(x=>x.label),['Burgerraad','Burger','Burger IO']);
 assert.deepEqual(chart.leadership.map(x=>x.members.map(m=>m.name)),
  [['Raadslid'],['Gewone burger'],['Lid in opleiding']]);
});
