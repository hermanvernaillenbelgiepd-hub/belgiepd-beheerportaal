import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarDays, validateLeaveRequest, validDiscordId, roleForDepartment,
  mayApproveLeave, mayManageGrants, activeGrant, validateGrant, leaveSubmissionStatus, leaveApplicantIsCorps
} from '../src/leave-policy.js';

const idA = '111111111111111111';
const idB = '222222222222222222';
const today = '2026-10-19';
const request = (endDate='2026-11-18') => ({
  personDiscordId:idB, subjectDepartments:['politie'], subjectDepartmentRoles:{politie:'basiskader'},
  startDate:'2026-10-20', endDate, status:'pending'
});
const actor = (role='middenkader') => ({
  discordId:idA, role, departments:['politie'],
  departmentRoles:{politie:role}
});

test('datums worden strikt gecontroleerd en beide grensdagen tellen mee',()=>{
  assert.equal(calendarDays('2026-10-20','2026-11-18'),30);
  assert.equal(calendarDays('2026-10-20','2026-11-19'),31);
  assert.throws(()=>calendarDays('2026-02-30','2026-03-01'));
  assert.throws(()=>calendarDays('2026-10-21','2026-10-20'));
  assert.throws(()=>calendarDays('2026-01-01','2028-01-02'));
  assert.deepEqual(validateLeaveRequest({startDate:'2026-10-20',endDate:'2026-10-20',note:'  Test  '}),
    {startDate:'2026-10-20',endDate:'2026-10-20',days:1,note:'Test'});
  assert.deepEqual(validateLeaveRequest({startDate:'2026-10-20',endDate:'2026-10-26',note:'  Test  '}),
    {startDate:'2026-10-20',endDate:'2026-10-26',days:7,note:'Test'});
});

test('middenkader mag maximaal dertig dagen behandelen, hoger kader meer',()=>{
  assert.equal(mayApproveLeave(actor(),request(),null,today),true);
  assert.equal(mayApproveLeave(actor(),request('2026-11-19'),null,today),false);
  assert.equal(mayApproveLeave(actor('officierenkader'),request('2026-11-19'),null,today),true);
  assert.equal(mayApproveLeave(actor('korpsleiding'),request('2026-11-19'),null,today),true);
});

test('eigen aanvraag en andere hulpdienst mogen niet worden goedgekeurd',()=>{
  assert.equal(mayApproveLeave({...actor(),discordId:idB},request(),null,today),false);
  assert.equal(mayApproveLeave(actor(),{...request(),subjectDepartments:['brandweer']},null,today),false);
  assert.equal(mayApproveLeave(actor(),{...request(),status:'approved'},null,today),false);
});

test('multi-dienstrollen zijn strikt gescheiden',()=>{
  const multi={discordId:idA,role:'korpsleiding',
    departments:['politie','brandweer'],departmentRoles:{politie:'middenkader'}};
  assert.equal(roleForDepartment(multi,'brandweer'),null);
  assert.equal(mayApproveLeave(multi,{...request(),subjectDepartments:['brandweer']},null,today),false);
  assert.equal(mayManageGrants(multi),false);
  assert.equal(roleForDepartment(actor('officierenkader'),'politie'),'officierenkader');
});

test('tijdelijke machtigingen vereisen geldige duur en niet-ingetrokken status',()=>{
  const grant={permission:'VERLOFBEHEER',level:'all',startsOn:'2026-10-19',expiresOn:'2026-10-30'};
  assert.ok(activeGrant(grant,today));
  assert.equal(activeGrant({...grant,revoked:true},today),null);
  assert.equal(activeGrant({...grant,expiresOn:'2026-10-18'},today),null);
  assert.equal(mayApproveLeave(actor(),request('2026-11-19'),grant,today),false);
  assert.throws(()=>validateGrant({discordId:idA,level:'all',startsOn:'2026-10-01',expiresOn:'2026-10-30'},today));
  assert.throws(()=>validateGrant({email:'x@example.com',level:'all',startsOn:'2026-10-20',expiresOn:'2026-10-30'},today));
  assert.equal(validDiscordId(idA),true);
  assert.equal(validDiscordId('abc'),false);
});

test('tijdelijke VERLOFBEHEER werkt met Discord-ID, nooit met willekeurig e-mailadres',()=>{
  const proposed={discordId:idB,level:'max30',startsOn:'2026-10-20',expiresOn:'2026-11-20'};
  const parsed=validateGrant(proposed,today);
  assert.deepEqual(parsed,{...proposed,permission:'VERLOFBEHEER'});
  assert.equal('email' in parsed,false);
  assert.equal(activeGrant(parsed,'2026-10-22')?.discordId,idB);
  assert.equal(activeGrant(parsed,'2026-11-21'),null);
  assert.equal(activeGrant({...parsed,revoked:true},'2026-10-22'),null);
  assert.throws(()=>validateGrant({...proposed,discordId:'santo-930'},today),/Discord/);
  assert.throws(()=>validateGrant({...proposed,discordId:'1234'},today),/Discord/);
  assert.throws(()=>validateGrant({...proposed,level:'admin'},today));
  assert.throws(()=>validateGrant({...proposed,expiresOn:'2029-01-01'},today));
});
test('de verlofpagina en routes mogen geen Google-e-mailadres als nieuwe machtiging gebruiken',()=>{
  // A valid Discord identity must be required even when extra fields are supplied.
  assert.throws(()=>validateGrant({email:'x@example.com',
    level:'max30',startsOn:'2026-10-20',expiresOn:'2026-11-20'},today),/Discord/);
  assert.equal(validDiscordId(idB),true);
});

test('1 t.e.m. 7 dagen automatisch, vanaf dag 8 beoordeling ook voor Korpsleiding',()=>{
  for(const days of [1,2,6,7])assert.equal(leaveSubmissionStatus(days),'approved');
  for(const days of [8,14,15,16,30,31,730])assert.equal(leaveSubmissionStatus(days),'pending');
  assert.equal(leaveSubmissionStatus(31,true),'pending');
  for(const days of [0,-1,731,3.5,NaN])assert.throws(()=>leaveSubmissionStatus(days));
  assert.equal(leaveApplicantIsCorps(actor('korpsleiding'),['politie']),true);
  assert.equal(leaveApplicantIsCorps(actor('officierenkader'),['politie']),false);
});
test('hiërarchie: alleen lagere kadergroepen, middenkader maximaal 30 dagen',()=>{
  const middleRequest={...request(),subjectDepartmentRoles:{politie:'middenkader'}};
  const officerRequest={...request(),subjectDepartmentRoles:{politie:'officierenkader'}};
  const corpRequest={...request(),subjectDepartmentRoles:{politie:'korpsleiding'}};
  assert.equal(mayApproveLeave(actor(),middleRequest,null,today),false);
  assert.equal(mayApproveLeave(actor('officierenkader'),middleRequest,null,today),true);
  assert.equal(mayApproveLeave(actor('officierenkader'),officerRequest,null,today),false);
  assert.equal(mayApproveLeave(actor('korpsleiding'),officerRequest,null,today),true);
  assert.equal(mayApproveLeave(actor('korpsleiding'),corpRequest,null,today),true); // Ander KL-lid, nooit de aanvrager
  assert.equal(mayApproveLeave(actor('officierenkader'),request('2026-11-19'),null,today),true);
  assert.equal(mayApproveLeave(actor(),request('2026-11-19'),null,today),false);
});
test('Bestuur kan tot 30 dagen behandelen of bestaande besluiten overrulen, maar dag 31+ vereist hoger kader',()=>{
  const longPending={...request('2026-11-19'),subjectDepartmentRoles:{politie:'korpsleiding'}};
  const shortPending={...request('2026-11-18'),subjectDepartmentRoles:{politie:'korpsleiding'}};
  assert.equal(mayApproveLeave(actor(),shortPending,null,today,true),true);
  assert.equal(mayApproveLeave(actor(),longPending,null,today,true),false);
  assert.equal(mayApproveLeave(actor('korpsleiding'),longPending,null,today,true),true);
  assert.equal(mayApproveLeave({...actor('korpsleiding'),discordId:idB},longPending,null,today,true),false);
  assert.equal(mayApproveLeave(actor(),{...longPending,status:'approved'},null,today,true),false);
});

// Bescherm de formuliertekst, auditlog en serverrechten tegen een terugval naar 7-14 dagen.
test('verlof vanaf 1 dag is zichtbaar beschikbaar en alle beslissingen blijven gelogd',async()=>{
  const {readFileSync}=await import('node:fs');
  const page=readFileSync(new URL('../public/verlofbeheer.html',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/leave-routes.js',import.meta.url),'utf8');
  const events=readFileSync(new URL('../src/leave-event-log.js',import.meta.url),'utf8');
  assert.match(page,/Elke verlofaanvraag vanaf 1 kalenderdag/);
  assert.doesNotMatch(page,/geen aanvraag nodig|korter dan 7 kalenderdagen hoef/);
  assert.match(routes,/leaveSubmissionStatus\(details\.days\)/);
  assert.match(routes,/duur_1_tot_7_dagen/);
  assert.match(routes,/action:'submitted'/);
  assert.match(routes,/action:'automatic_approved'/);
  assert.match(events,/tx\.create\(notice/);
  assert.match(events,/tx\.create\(ref/);
});
