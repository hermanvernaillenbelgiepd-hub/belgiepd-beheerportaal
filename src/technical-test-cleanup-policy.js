// Scoped technical cleanup: only clearly marked test entries may be hidden.
// No bulk deletion, no personnel records, leave, weekreports or permanent erasure.
import {mayEditTechnicalSettings} from './technical-center-config.js';
import {CITIZEN_ENTRY_KINDS} from './citizen-dossier-policy.js';
import {STAFF_NOTE_TYPES} from './staff-dossier-policy.js';
import {mayRetireCaseType} from './dossier-retirement-policy.js';

const ID=/^\d{15,22}$/;
const ENTRY=/^[A-Za-z0-9_-]{8,120}$/;
export const TEST_CLEANUP_SERVICES=Object.freeze([
  'politie','brandweer','ambulance','depannage','burger'
]);
export const TEST_CLEANUP_AUDIT='bpd_technical_cleanup_audit';
export const TEST_CLEANUP_MARKER='technical-test-cleanup';
export const TEST_CLEANUP_SOURCES=Object.freeze(['cases','staff','citizen']);

export function mayUseTestCleanup(actor){
  return mayEditTechnicalSettings(actor);
}
export function validCleanupScope(dept,discordId,source=null){
  if(!TEST_CLEANUP_SERVICES.includes(dept)||typeof discordId!=='string'||
    !ID.test(discordId))return false;
  if(source===null)return true;
  return TEST_CLEANUP_SOURCES.includes(source)&&
    (dept==='burger'?source==='citizen':source!=='citizen');
}
export function recognizedTestMarker(value){
  if(typeof value!=='string')return false;
  const text=value.trim();
  // Deliberate marker at the beginning of the content; not an incidental
  // occurrence of "test" inside official observations or sanctions.
  return /^(?:\[(?:test|demo|proef|voorbeeld)\]|(?:test|demo|proef|voorbeeld)(?:[\s:;.!-]|$))/i.test(text);
}
export function canCleanupRecord(source,data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
    !TEST_CLEANUP_SOURCES.includes(source))return false;
  const kindOk=source==='citizen'?CITIZEN_ENTRY_KINDS.includes(data.kind):
    source==='staff'?STAFF_NOTE_TYPES.includes(data.kind):
    mayRetireCaseType(data);
  if(!kindOk)return false;
  // Structural test flags and deliberately prefixed human notes only.
  return data.isTest===true||data.testData===true||
    [data.details,data.title].some(recognizedTestMarker);
}
export function cleanupRecordState(source,data){
  if(data?.cleanup?.marker===TEST_CLEANUP_MARKER&&
    data.cleanup?.state==='withdrawn')return 'withdrawn';
  if(source==='citizen'){
    return data?.deletedAt?'other-retired':'active';
  }
  return data?.status==='verwijderd'||data?.retired?.at?
    'other-retired':'active';
}
export function validateCleanupCommand(body,action){
  if(!['withdraw','restore'].includes(action)||!body||
    typeof body!=='object'||Array.isArray(body))throw Error('Ongeldige opschoonactie');
  const keys=['dept','discordId','source','entryId','reason','confirm'];
  if(Object.keys(body).length!==keys.length||
    Object.keys(body).some(k=>!keys.includes(k))||
    keys.some(k=>!Object.hasOwn(body,k)))throw Error('Onvolledig opschoonverzoek');
  if(!validCleanupScope(body.dept,body.discordId,body.source)||
    typeof body.entryId!=='string'||!ENTRY.test(body.entryId))
    throw Error('Ongeldige dossierverwijzing');
  const expected=action==='withdraw'?'INTREKKEN':'HERSTELLEN';
  if(body.confirm!==expected)throw Error('Typ '+expected+' om te bevestigen');
  if(typeof body.reason!=='string'||body.reason.trim().length<12||
    body.reason.trim().length>500||/[\x00-\x1f\x7f<>]/.test(body.reason))
    throw Error('Geef een concrete reden van 12 tot 500 tekens');
  return {dept:body.dept,discordId:body.discordId,source:body.source,
    entryId:body.entryId,reason:body.reason.trim()};
}
