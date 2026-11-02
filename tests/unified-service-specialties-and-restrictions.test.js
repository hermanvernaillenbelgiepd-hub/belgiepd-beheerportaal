import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restrictionStatus,validateRestrictionAction,safeRestrictionEntry,
  canRestrictSpecialty} from '../src/specialty-restriction-policy.js';

const today='2026-11-02';
test('restriction expires automatically but retains the saved qualification',()=>{
 assert.equal(restrictionStatus({status:'active',startDate:'2026-11-01',
  endDate:'2026-11-02'},today),'actief');
 assert.equal(restrictionStatus({status:'active',startDate:'2026-10-01',
  endDate:'2026-11-01'},today),'verlopen');
 assert.equal(restrictionStatus({status:'active',startDate:'2026-11-03',
  endDate:'2026-11-04'},today),'gepland');
 assert.equal(restrictionStatus({status:'lifted',startDate:'2026-11-01',
  endDate:'2026-11-10'},today),'ingetrokken');
});
test('all four services have validated restrictions, including MOTARD, AE, TO and DISP',()=>{
 for(const [dept,label] of [
  ['politie','Motor'],['politie','AE'],['politie','TO'],
  ['politie','Dispatch'],['brandweer','Ladderwagen'],
  ['ambulance','Medicatie'],['depannage','CRANE']
 ]){
  const input=validateRestrictionAction({action:'restrict',label,
   startDate:today,endDate:'2026-12-01',reason:'Tijdelijk beperkt na evaluatie',
   expectedRevision:0},dept,[],today);
  assert.equal(input.label,label);
 }
 assert.throws(()=>validateRestrictionAction({action:'restrict',label:'AE',
  startDate:'2026-11-03',endDate:'2026-11-01',
  reason:'Tijdelijke beperking gerechtvaardigd',expectedRevision:0},
  'politie',[],today),/begin- en einddatum/);
});
test('restricted personnel record uses strict audit data and no invented privileges',()=>{
 const safe=safeRestrictionEntry({label:'AE',status:'active',startDate:today,
  endDate:'2026-12-01',reason:'Onder toezicht',changedBy:'123456789123456789'},
  'AaBb01234567',today);
 assert.equal(safe.status,'actief');
 assert.equal(safe.changedBy,'123456789123456789');
 assert.equal(canRestrictSpecialty({},{}),false);
});
test('integration is scoped to dossier API, all-service UI, and dynamic weekreports',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/specialty-restriction-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const report=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 assert.match(server,/installSpecialtyRestrictionRoutes\(app/);
 assert.match(route,/canReadPersonnelSubject\(req\.bpd,matched\[0\]\)/);
 assert.match(route,/canRestrictSpecialty\(req\.bpd,staff\)/);
 assert.match(route,/PERSONNEL_ACTIVITY_COLLECTION/);
 assert.match(route,/tx\.create\(ref\.collection\('audit'\)/);
 assert.match(page,/specialty-dossier-controls\.js/);
 assert.match(page,/window\.BPDSpecialtyDossierControls\?\.render/);
 assert.match(page,/importantPortalRestrictionEntries/);
 assert.match(route,/Geen toegang tot vertrouwelijke Brandweerbeperkingen/);
 assert.match(report,/specialty_restriction_started/);
 assert.match(report,/specialty_restriction_lifted/);
});
