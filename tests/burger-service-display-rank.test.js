import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceProfileRank} from '../public/service-profile-presentation.js';
import {serviceHierarchy} from '../public/assets/organogram-hierarchie-model.js';
const person=(name,burgerGroups,rank='Ambulancier')=>({
 dept:'burger',name,rank,call:'—',specialties:[],burgerGroups,leadershipTier:'none'
});
test('Burgerraad member displays Burgerraad, never an ambulance rank',()=>{
 const yassine=person('Yassine',['Burgerraad','Burger']);
 assert.equal(serviceProfileRank(yassine),'Burgerraad');
 assert.deepEqual(serviceHierarchy([yassine],'burger').leadership[0].members.map(p=>p.name),['Yassine']);
});
test('ordinary citizens show Burger and trainees show BIO',()=>{
 assert.equal(serviceProfileRank(person('Burger lid',['Burger'])),'Burger');
 assert.equal(serviceProfileRank(person('Lid in opleiding',['Burger IO'])),'BIO');
 assert.equal(serviceProfileRank(person('Burger zonder Discord',[])),'Burger');
});
test('Citizen rank does not affect ambulance rank or original service identity',()=>{
 const medical={dept:'ambulance',rank:'Ambulancier'};
 assert.equal(serviceProfileRank(medical),'Ambulancier');
 assert.equal(medical.rank,'Ambulancier');
});
