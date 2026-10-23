import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {receivedAccess,receivedAuthor,receivedGroup,staffCadreLevel}
  from '../src/received-registration-policy.js';

const staff=(call,rank,id)=>({dept:'politie',personId:id,call,rank,name:'Test '+call});
const author=staff('S408','Inspecteur van politie','111111111111111111');
const agent=staff('S258','Agent van Politie','222222222222222222');
const middle=staff('S650','Aspirant Hoofdinspecteur van Politie','333333333333333333');
const high=staff('S950','Commissaris','444444444444444444');
const people=[author,agent,middle,high];
const actor=role=>({role,departments:['politie'],
  dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie'],
  departmentRoles:{politie:role},discordId:'555555555555555555'});

test('Agentenkader en basiskader delen één ontvangen rubriek, Middenkader een andere',()=>{
  assert.equal(receivedGroup(author),'basiskader');
  assert.equal(receivedGroup(agent),'basiskader');
  assert.equal(receivedGroup(middle),'middenkader');
  assert.equal(receivedGroup(high),null);
});
test('Middenkader ziet alleen ontvangen registraties voor lager personeel',()=>{
  assert.deepEqual(receivedAccess(actor('middenkader'),agent),['basiskader']);
  assert.deepEqual(receivedAccess(actor('middenkader'),author),['basiskader']);
  assert.deepEqual(receivedAccess(actor('middenkader'),middle),[]);
  assert.deepEqual(receivedAccess(actor('middenkader'),high),[]);
  assert.deepEqual(receivedAccess(actor('basiskader'),agent),[]);
});
test('Officierenkader en Korpsleiding zien aparte basis- en middenrubrieken, maar geen gelijken',()=>{
  assert.deepEqual(receivedAccess(actor('officierenkader'),author),
    ['basiskader','middenkader']);
  assert.deepEqual(receivedAccess(actor('officierenkader'),middle),
    ['basiskader','middenkader']);
  assert.deepEqual(receivedAccess(actor('officierenkader'),high),[]);
  assert.deepEqual(receivedAccess(actor('korpsleiding'),high),
    ['basiskader','middenkader']);
});
test('Dienstgrenzen en ongeldig beheerprofiel sluiten ontvangen dossiers af',()=>{
  const other=staff('BW-20','Brandweerman','666666666666666666');other.dept='brandweer';
  assert.deepEqual(receivedAccess(actor('korpsleiding'),other),[]);
  assert.deepEqual(receivedAccess({...actor('officierenkader'),dossierNativeDepartments:[]},agent),[]);
  assert.deepEqual(receivedAccess({...actor('officierenkader'),departments:['ambulance']},agent),[]);
  assert.equal(staffCadreLevel(high),3);
});
test('Categorie volgt originele indiener, nooit onBehalfOf of door browser gekozen rol',()=>{
  const actual={submittedByActor:{discordId:author.personId},
    registeredBy:{discordId:middle.personId},onBehalfOf:{discordId:middle.personId},
    category:'middenkader'};
  assert.equal(receivedAuthor(actual,people).bucket,'basiskader');
  assert.equal(receivedAuthor({registeredBy:{discordId:middle.personId}},people).bucket,
    'middenkader');
  assert.equal(receivedAuthor({registeredBy:{discordId:middle.personId}},
    [middle,middle]),null);
  assert.equal(receivedAuthor({registeredBy:{discordId:'999999999999999999'}},people),null);
});
test('Ontvangen-lijsten worden server-side gefilterd zonder e-mail of technische auditgegevens',()=>{
  const source=readFileSync(new URL('../src/received-registration-routes.js',import.meta.url),'utf8');
  assert.match(source,/receivedAccess\(req\.bpd,matches\[0\]\)/);
  assert.match(source,/receivedAuthor\(record,people\)/);
  assert.match(source,/allowed\.includes\(author\.bucket\)/);
  assert.match(source,/Cache-Control','private, no-store'/);
  assert.doesNotMatch(source,/submittedBy:record\.submittedBy/);
});

test('Registratie blijft in oorspronkelijk indienerkader na latere promotie',()=>{
  const promoted={...author,call:'S650',rank:'Hoofdinspecteur van politie'};
  const record={
    submittedByActor:{discordId:author.personId,name:'Oorspronkelijke naam',
      call:'S408',rank:'Inspecteur van politie'},
    registeredBy:{discordId:author.personId,name:'Oorspronkelijke naam',
      call:'S408',rank:'Inspecteur van politie'}
  };
  const origin=receivedAuthor(record,[promoted]);
  assert.equal(origin.bucket,'basiskader');
  assert.equal(origin.call,'S408');
  assert.equal(origin.rank,'Inspecteur van politie');
});
