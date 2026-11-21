import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANAGEMENT_TYPES,RECORD_LABELS,validateManagementEntry,reportSections}
 from '../src/management-utils.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Belangrijke en gewone notities blijven apart, met zelfde auditable Firestore-case',()=>{
 for(const type of ['notitie','algemene_notitie','inactiviteitsping']){
  assert.ok(MANAGEMENT_TYPES.includes(type));
  const entry=validateManagementEntry({type,eventDate:'2026-11-19',
   details:'Registratie met datum, auteur en uitgebreide dossieromschrijving'});
  assert.equal(entry.reportCategory,type);
  const report=reportSections([{...entry,registeredBy:{name:'Officier',call:'930'}}],
   '2026-11-16','2026-11-29');
  assert.equal(report.find(group=>group.type===type).entries.length,1);
 }
 assert.equal(RECORD_LABELS.notitie,'Belangrijke notitie');
 assert.equal(RECORD_LABELS.algemene_notitie,'Algemene notitie');
 assert.equal(RECORD_LABELS.inactiviteitsping,'Activiteitenping');
});
test('Read-after-write validates newly saved dossier item before success message',()=>{
 const html=read('public/personeelsbeheer.html');
 assert.ok(html.includes("const stored=await request('/api/management/cases'"));
 assert.ok(html.includes('if(stored?.saved!==true||!stored.reference)'));
 assert.ok(html.includes('row.id===stored.reference&&'));
 assert.ok(html.includes('row.type===type&&row.subjectDiscordId===person.discordId'));
 assert.ok(html.includes('sheetCaseRows(readBack.entries||[],readBack.limited)'));
 assert.ok(html.includes('opgeslagen én opnieuw teruggelezen uit het personeelsdossier'));
 const api=read('src/management-routes.js');
 assert.ok(api.includes("db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').doc()"));
 assert.ok(api.includes("batch.create(notice,{caseId:caseId(dept,id),entryId:newDoc.id,type,dept"));
 assert.ok(api.includes("res.status(201).json({saved:true,reference:newDoc.id})"));
});
test('Full content shows in important notes and dedicated Activity Pings tile',()=>{
 const html=read('public/personeelsbeheer.html');
 for(const token of ["id=\"sheetActivityPings\"","id=\"sheetNotes\"",
  "id=\"registerImportantNoteQuick\"","id=\"registerActivityPingQuick\"",
  "id='dossierImportantNoteList'","body.textContent=String(row.details||'—')",
  "sheetSetRows('activityPings',activityPings","'case:notitie'","'case:inactiviteitsping'"])
   assert.ok(html.includes(token),token);
 assert.ok(html.includes("x.type==='inactiviteitsping'"));
 const notifications=read('public/meldingen.html');
 assert.ok(notifications.includes(":'Activiteitenping')"));
});
