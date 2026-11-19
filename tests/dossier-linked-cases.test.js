import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedColleagueLink,sameDayCategories,createColleagueLink}
 from '../src/dossier-linked-cases.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const A='333333333333333333',B='444444444444444444',C='555555555555555555';
const people=[{personId:A,dept:'politie',name:'Primair',call:'450',rank:'Inspecteur'},
 {personId:B,dept:'politie',name:'Collega',call:'455',rank:'Inspecteur'},
 {personId:C,dept:'ambulance',name:'Verpleger',call:'AMB-01'}];
const actor={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
test('Gekoppelde collega moet uniek zijn, in dezelfde dienst, en leesbaar voor de actor',()=>{
 assert.equal(verifiedColleagueLink(B,'politie',A,people,actor,'observatie').personId,B);
 assert.equal(verifiedColleagueLink('', 'politie',A,people,actor,'observatie'),null);
 assert.throws(()=>verifiedColleagueLink(A,'politie',A,people,actor,'observatie'),/Ongeldige/);
 assert.throws(()=>verifiedColleagueLink(C,'politie',A,people,actor,'observatie'),/Geen dossierbevoegdheid/);
 assert.throws(()=>verifiedColleagueLink(B,'politie',A,people,actor,'sanctie'),/Ongeldige/);
 assert.throws(()=>verifiedColleagueLink(B,'politie',A,[...people,people[1]],actor,'observatie'),/Geen dossierbevoegdheid/);
});
test('Gekoppelde fiche ontvangt een indexverwijzing, geen extra score of weekrapportitem',()=>{
 const calls=[],db={collection:name=>({doc:id=>({
  collection:child=>({doc:entryId=>({path:name+'/'+id+'/'+child+'/'+entryId})})
 })})};
 const batch={create:(ref,data)=>calls.push({ref,data})};
 createColleagueLink(db,batch,{dept:'politie',primaryId:A,entryId:'AbCdEf01234567890123',
  type:'observatie',eventDate:'2026-11-19',colleague:people[1],at:'timestamp'});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].data,{dept:'politie',sourceDiscordId:A,
  sourceEntryId:'AbCdEf01234567890123',type:'observatie',
  eventDate:'2026-11-19',createdAt:'timestamp'});
 assert.equal(sameDayCategories([{type:'observatie',eventDate:'2026-11-19'},
  {type:'algemene_notitie',eventDate:'2026-11-19'},
  {type:'sanctie',status:'verwijderd'}]).count,2);
 const ui=source('public/personeelsbeheer.html');
 assert.ok(ui.includes("item.linked===true"));
 assert.ok(ui.includes("row.linked===true"));
 assert.ok(ui.includes('scheduleDossierDateWarning()'));
 const api=source('src/registration-routes.js');
 assert.ok(api.includes("'/api/registrations/date-check'"));
});
