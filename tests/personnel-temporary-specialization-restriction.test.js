import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validateEntry,validateAmend} from '../src/registrations.js';
import {reportSections} from '../src/management-utils.js';
import {specialFields} from '../src/report-export.js';

const sanction={
  type:'sanctie',dept:'politie',details:'Beperking wegens onveilige uitvoering',
  eventDate:'2026-10-24',eventTime:'15:00',otherPlayers:'',evidenceUrl:'',
  sanctionType:'Tijdelijke beperking',explanation:'Opvolgen voor terugkeer',
  reasons:['Veiligheid'],reasonOther:'',severity:5,cfxName:'',
  restrictedSpecialties:['Motor','SIV/WPR'],endDate:'2026-11-30'
};
test('Tijdelijke beperkingen bewaren alleen bestaande dienstspecialisaties en geldige einddatum',()=>{
  const entry=validateEntry(sanction);
  assert.deepEqual(entry.restrictedSpecialties,['Motor','SIV/WPR']);
  assert.equal(entry.endDate,'2026-11-30');
  assert.equal(entry.status,'actief');
  assert.deepEqual(validateAmend({...sanction,amendmentReason:'Geldige dossierwijziging'}).restrictedSpecialties,
    ['Motor','SIV/WPR']);
  assert.throws(()=>validateEntry({...sanction,restrictedSpecialties:[]}),/Selecteer minstens/);
  assert.throws(()=>validateEntry({...sanction,restrictedSpecialties:['Motor','Motor']}),/Selecteer minstens/);
  assert.throws(()=>validateEntry({...sanction,restrictedSpecialties:['Onbestaande specialisatie']}),/Selecteer minstens/);
  assert.throws(()=>validateEntry({...sanction,dept:'brandweer',restrictedSpecialties:['SIV/WPR']}),/Selecteer minstens/);
  assert.throws(()=>validateEntry({...sanction,endDate:'2026-10-23'}),/Einddatum tijdelijke beperking/);
  assert.throws(()=>validateEntry({...sanction,endDate:'2026-02-30'}),/Ongeldige datum/);
  assert.throws(()=>validateEntry({...sanction,endDate:''}),/Vereist veld/);
  assert.throws(()=>validateEntry({...sanction,sanctionType:'Officiële waarschuwing'}),/Specialisatie en einddatum/);
});
test('Het dynamisch lopend weekrapport neemt de originele sanctie en beide details over',()=>{
  const value={...validateEntry(sanction),dept:'politie',subjectDiscordId:'123456789012345678'};
  const sections=reportSections([value],'2026-10-19','2026-10-25');
  const sanctions=sections.find(x=>x.type==='sanctie');
  assert.ok(sanctions);
  assert.equal(sanctions.entries.length,1);
  assert.deepEqual(sanctions.entries[0].restrictedSpecialties,['Motor','SIV/WPR']);
  assert.equal(sanctions.entries[0].endDate,'2026-11-30');
  const special=specialFields(value);
  assert.ok(special.includes('Beperkte specialisaties: Motor, SIV/WPR'));
  assert.ok(special.includes('Tijdelijke beperking tot en met: 2026-11-30'));
  assert.equal(reportSections([value],'2026-10-26','2026-11-01')
    .find(x=>x.type==='sanctie').entries.length,0);
});
test('Formulier toont selectie uitsluitend voor beperking en bewaart deze in het dossier',()=>{
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../src/registration-routes.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');
 assert.match(api,/restrictionSpecialtiesByDepartment:Object\.fromEntries/);
 for(const id of ['formalSpecializationRestrictionFields','formalRestrictedSpecialties','formalRestrictionEndDate'])
   assert.match(ui,new RegExp('id="'+id+'"'));
 assert.match(ui,/data\.restrictedSpecialties=selectedRestrictedSpecialties\(\)/);
 assert.match(ui,/data\.endDate=\$\('formalRestrictionEndDate'\)\.value/);
 assert.match(ui,/renderRestrictionSpecialties\(data\.restrictionSpecialtiesByDepartment\?\.\[p\.dept\]\|\|\[\]\)/);
 assert.match(ui,/\$\('formalSpecializationRestrictionFields'\)\.hidden=!restrict/);
 assert.match(ui,/Array\.isArray\(row\.restrictedSpecialties\)/);
 assert.match(ui,/x\.endDate\?'Tot en met: '/);
 assert.match(css,/#formalSpecializationRestrictionFields\[hidden\]/);
 const inline=ui.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Script(inline.replace(/^import [^\n]*\n/gm,'')));
});
