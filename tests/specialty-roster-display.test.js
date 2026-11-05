import test from 'node:test';
import assert from 'node:assert/strict';
import {overlayVerifiedRosterSpecialties} from '../src/specialty-roster-display.js';
const id='123456789012345678',other='123456789012345679';
const io='1490841316656156802',full='1309532437977497700';
const lead='1337775768083632158',instructor='1337156006597103746';
const api=roles=>({status:'ok',entries:new Map([[id,roles]])});
const item=(label,value='Niet ingevuld',source='google-sheets')=>({label,value,source});
const row=(dept='politie',specialties=[item('RAGO')])=>({dept,personId:id,specialties,
 special:'Geen geregistreerde specialisaties',rank:'Inspecteur',call:'485'});
const links=(label,roleId,value,level='')=>({label,roleId,value,level});
test('RAGO full supersedes IO, updates list, and never changes personnel source',()=>{
 const source=row(),out=overlayVerifiedRosterSpecialties([source],api([io,full]),new Map([
  ['politie',[links('RAGO',io,'AANGEMELD'),links('RAGO',full,'Ja','Volwaardig')]]
 ]));
 assert.equal(out[0].specialties[0].value,'Ja');
 assert.equal(out[0].special,'RAGO: Ja');
 assert.equal(source.specialties[0].value,'Niet ingevuld');
 assert.equal(out[0].rank,'Inspecteur');
});
test('AE teamleader takes precedence over instructor with verified roles',()=>{
 const out=overlayVerifiedRosterSpecialties([row('politie',[item('AE')])],api([lead,instructor]),new Map([
  ['politie',[links('AE',instructor,'INSTRUCTEUR'),links('AE',lead,'LEIDING','Teamleader')]]
 ]));
 assert.equal(out[0].specialties[0].value,'LEIDING');
 assert.equal(out[0].specialties[0].level,'Teamleader');
});
test('manual restrictions and per-service identity remain untouched',()=>{
 const police=row('politie',[item('RAGO','RESTRICTED','manual')]);
 const fire=row('brandweer',[item('Duiker')]);
 const out=overlayVerifiedRosterSpecialties([police,fire],api([full]),new Map([
  ['politie',[links('RAGO',full,'Ja')]],
  ['brandweer',[links('Duiker',full,'Ja')]]
 ]));
 assert.equal(out[0],police);
 assert.equal(out[1].specialties[0].value,'Ja');
});
test('unavailable, malformed, unmatched and duplicate roles fail closed',()=>{
 const source=row(),linkMap=new Map([['politie',[links('RAGO',full,'Ja')]]]);
 assert.equal(overlayVerifiedRosterSpecialties([source],{status:'unavailable'},linkMap)[0],source);
 assert.equal(overlayVerifiedRosterSpecialties([source],api(['invalid']),linkMap)[0],source);
 assert.equal(overlayVerifiedRosterSpecialties([source],{status:'ok',entries:new Map([[other,[full]]])},linkMap)[0],source);
 const duplicate=overlayVerifiedRosterSpecialties([source,{...source}],api([full]),linkMap);
 assert.equal(duplicate[0],source);
 assert.equal(duplicate[1].specialties[0].value,'Niet ingevuld');
});
