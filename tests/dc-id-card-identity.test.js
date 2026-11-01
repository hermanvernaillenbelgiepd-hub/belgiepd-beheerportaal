import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findOrganogramCardPerson} from '../public/assets/organogram-card-identity.js';

const one='1263877296129970198',two='234567890123456789';
const people=[
 {dept:'politie',personId:one,call:'485',name:'Nieuwe Naam'},
 {dept:'politie',personId:two,call:'486',name:'Andere Persoon'}
];

test('DC-ID resolves the correct person despite outdated callsign or name',()=>{
 assert.equal(findOrganogramCardPerson(people,{
  dept:'politie',dcId:one,call:'300',name:'Oude Naam'
 }),people[0]);
});

test('Unknown, invalid or wrong-department DC-ID cannot open somebody else by callsign',()=>{
 for(const dcId of ['123456789012345678','not-an-id']){
  assert.equal(findOrganogramCardPerson(people,{
   dept:'politie',dcId,call:'485',name:'Nieuwe Naam'
  }),null);
 }
 assert.equal(findOrganogramCardPerson(people,{
  dept:'ambulance',dcId:one,call:'485',name:'Nieuwe Naam'
 }),null);
});

test('Old public cards without DC-ID retain a unique call/name fallback',()=>{
 assert.equal(findOrganogramCardPerson(people,{
  dept:'politie',call:'485',name:'Nieuwe Naam'
 }),people[0]);
 assert.equal(findOrganogramCardPerson([...people,
  {dept:'politie',personId:'345678901234567890',call:'485',name:'Nieuwe Naam'}],{
   dept:'politie',call:'485',name:'Nieuwe Naam'
  }),null);
});

test('Manager and organogram pass and prefer DC-ID while public directory remains ID-free',()=>{
 const manage=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const organogram=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 const directory=readFileSync(new URL('../public/personeelslijst.html',import.meta.url),'utf8');
 assert.match(manage,/params\.set\('dcId',id\)/);
 assert.match(organogram,/findOrganogramCardPerson\(state\.live,requestedCard\)/);
 assert.match(organogram,/requestedDCId=String\(cardParams\.get\('dcId'\)/);
 assert.match(directory,/dienst:'politie',kaart:call,naam:name/);
 assert.doesNotMatch(directory,/params\.set\('dcId'/);
});
