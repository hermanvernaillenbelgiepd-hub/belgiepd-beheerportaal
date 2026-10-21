import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarDays, validateLeaveRequest, validDiscordId, roleForDepartment,
  mayApproveLeave, mayManageGrants, activeGrant, validateGrant
} from '../src/leave-policy.js';

const idA = '111111111111111111';
const idB = '222222222222222222';
const today = '2026-10-19';
const request = (endDate='2026-11-18') => ({
  personDiscordId:idB, subjectDepartments:['politie'],
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
  assert.equal(mayApproveLeave(actor(),request('2026-11-19'),grant,today),true);
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
