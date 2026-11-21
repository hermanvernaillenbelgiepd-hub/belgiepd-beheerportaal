import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalRosterName,projectCanonicalPersonnelNames,
  normalizedIdentityName} from '../src/personnel-identity-policy.js';
import {checkServiceEnrollment} from '../src/service-enrollment-policy.js';

const id='1398985105254650007',other='1309532438019706966';
const records=[
 {dept:'politie',personId:id,name:'Echte Naam',call:'425'},
 {dept:'brandweer',personId:id,name:'Anders Geschreven',call:'BW-18'},
 {dept:'ambulance',personId:id,name:'Verouderde Naam',call:'A-8'},
 {dept:'politie',personId:other,name:'Echte Naam',call:'430'}
];

test('Cross-service name uses the same Discord identity without merging two people',()=>{
 const out=projectCanonicalPersonnelNames(records);
 assert.equal(out.filter(x=>x.personId===id).length,3);
 assert.ok(out.filter(x=>x.personId===id).every(x=>x.name==='Echte Naam'));
 assert.equal(out.find(x=>x.personId===other).name,'Echte Naam');
 assert.equal(canonicalRosterName(records,id),'Echte Naam');
 assert.equal(normalizedIdentityName('  NAAM '),'naam');
 assert.equal(records[1].name,'Anders Geschreven','original service source is not overwritten');
});
test('Audited name ledger projects one name while preserving service ranks',()=>{
 const ledger=[{id,data:()=>({discordId:id,name:'Nieuwe Canonieke Naam'})}];
 const out=projectCanonicalPersonnelNames(records,ledger);
 assert.ok(out.filter(x=>x.personId===id).every(x=>x.name==='Nieuwe Canonieke Naam'));
 assert.equal(out.find(x=>x.dept==='brandweer').call,'BW-18');
 assert.equal(out.find(x=>x.personId===other).name,'Echte Naam');
});
test('Ambiguous police identity cannot be silently normalised',()=>{
 const duplicated=[...records,{dept:'politie',personId:id,name:'Andere Identiteit',call:'426'}];
 const out=projectCanonicalPersonnelNames(duplicated);
 assert.equal(out.find(x=>x.dept==='brandweer').name,'Anders Geschreven');
 assert.equal(canonicalRosterName(duplicated,id),null);
});
test('Archived police roster never authorizes new enrolment in another service',()=>{
 const old=[{dept:'politie',personId:id,call:'425',lifecycleState:'archived'}];
 assert.equal(checkServiceEnrollment(old,'brandweer',id).allowed,false);
 assert.equal(checkServiceEnrollment([{...old[0],lifecycleState:'pending'}],'ambulance',id).allowed,false);
 assert.equal(checkServiceEnrollment([{...old[0],lifecycleState:'active'}],'brandweer',id).allowed,true);
});
test('Account, callsign and dossier routes require an explicit review process',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 assert.match(read('../src/callsign-selfservice-routes.js'),/archived_callsign_attempt/);
 assert.match(read('../src/user-routes.js'),/unknown_dc_login/);
 assert.match(read('../src/personnel-return-review-routes.js'),/mayAdministerDcTransfer/);
 assert.match(read('../src/personnel-return-review-routes.js'),/requiresHumanReview:true/);
 assert.match(read('../public/meldingen.html'),/identityReviewPanel/);
 assert.match(read('../src/dc-id-transfer-routes.js'),/bpd_personnel_identity_names/);
});
