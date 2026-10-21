import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  fixedCall,applicantRequest,canInspect,canAssign,claimedCalls,
  availableCalls,proposedCall,claimId,existingApplicant,portalReady
} from '../src/callsign-portal-policy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ID='123456789012345678';
const cadre=role=>({role,departments:['politie'],departmentRoles:{politie:role}});
test('200–299 bounds strictly enforced; invalid and untrusted strings rejected',()=>{
  assert.equal(fixedCall(200),200);
  assert.equal(fixedCall('299'),299);
  for(const value of [199,300,-1,'0200','200abc','2.00','',null,undefined,'200 OR 1']){
    assert.throws(()=>fixedCall(value),/roepnummer/);
  }
  assert.equal(fixedCall('',{optional:true}),null);
  assert.equal(fixedCall(null,{optional:true}),null);
  assert.deepEqual(availableCalls(new Set([200,201,299])).slice(0,2),[202,203]);
  assert.equal(availableCalls(new Set([200,201,299])).at(-1),298);
});
test('Self and cadre intake check temporary calls and identity consistently',()=>{
  const p=applicantRequest({name:'Yassine',temporaryCall:166,preferredCall:251},ID);
  assert.deepEqual(p,{name:'Yassine',discordId:ID,temporaryCall:'166',preferredCall:251});
  assert.equal(applicantRequest({name:'Yassine',temporaryCall:110},ID).preferredCall,null);
  for(const call of [100,109,196,200,'abc']){
    assert.throws(()=>applicantRequest({name:'Yassine',temporaryCall:call},ID),/Tijdelijk/);
  }
  assert.throws(()=>applicantRequest({name:'Agent',temporaryCall:166},'not_discord_id'),/Discord/);
  assert.throws(()=>applicantRequest({name:'=IMPORTXML',temporaryCall:166},ID),/naam/);
});
test('Only scoped police cadre may verify or make binding decisions',()=>{
  assert.equal(canInspect(cadre('middenkader')),true);
  assert.equal(canAssign(cadre('middenkader')),false);
  assert.equal(canAssign(cadre('officierenkader')),true);
  assert.equal(canAssign(cadre('korpsleiding')),true);
  assert.equal(canAssign(cadre('basiskader')),false);
  assert.equal(canAssign({...cadre('korpsleiding'),departmentRoles:{politie:'middenkader'}}),false);
  assert.equal(canInspect({...cadre('officierenkader'),departments:['ambulance']}),false);
  assert.equal(canAssign({role:'beheerder',departments:['politie'],departmentRoles:{politie:'beheerder'}}),true);
});
test('Both historical sheet numbers and Firestore claims make call unavailable',()=>{
  const used=claimedCalls(
    [{dept:'politie',call:'200',name:'Existing'}, {dept:'ambulance',call:'201'}, {dept:'politie',call:'299'}],
    [{call:'201',dept:'politie'}, {call:'202',dept:'politie'}],
    [{id:'203',discordId:ID}, {call:'204',discordId:ID}]);
  assert.deepEqual(availableCalls(used).slice(0,2),[205,206]);
  assert.equal(availableCalls(used).includes(299),false);
  assert.equal(proposedCall(availableCalls(used),null),205);
  assert.equal(proposedCall(availableCalls(used),207),207);
  assert.throws(()=>proposedCall(availableCalls(used),203),/niet meer vrij/);
  assert.throws(()=>proposedCall([],null),/geen vrij/);
});
test('A new applicant may not duplicate an existing police Discord identity or name',()=>{
  const roster=[{dept:'politie',personId:ID,name:'Pieter',call:'225'}];
  assert.equal(existingApplicant(roster,ID,'Iemand anders'),true);
  assert.equal(existingApplicant(roster,'222222222222222222','pieter'),true);
  assert.equal(existingApplicant(roster,'222222222222222222','Nieuwe Naam'),false);
});
test('Call claims are generated from the SAME global police reservation key as personnel intake',async()=>{
  const {personnelCallClaimId}=await import('../src/personnel-editor-policy.js');
  for(const call of [200,201,299])assert.equal(claimId(call),personnelCallClaimId('politie',String(call)));
});
test('Portal approvals fail closed until explicit flags including dossiers are enabled',()=>{
  assert.equal(portalReady({}),false);
  assert.equal(portalReady({BPD_ENABLE_CALLSIGN_REQUESTS:'true',BPD_ENABLE_PORTAL_CALLSIGN_APPROVALS:'true'}),false);
  assert.equal(portalReady({BPD_ENABLE_CALLSIGN_REQUESTS:'true',BPD_ENABLE_PORTAL_CALLSIGN_APPROVALS:'true',BPD_ENABLE_STAFF_DOSSIERS:'true'}),true);
});
test('API writes no Sheets; creates linked Firestore person, staff dossier, case, audit atomically',()=>{
  const route=read('src/callsign-routes.js');
  assert.ok(!route.includes('performPoliceSync'));
  assert.ok(!route.includes('googleapis'));
  assert.ok(route.includes("app.post('/api/callsigns/self',discordApplicant"));
  assert.ok(route.includes("verifiedDiscordIdentity(verified,member.data()"));
  assert.ok(route.includes("tx.create(primary"));
  assert.ok(route.includes("tx.create(legacy"));
  assert.ok(route.includes("tx.create(person"));
  assert.ok(route.includes("tx.create(dossier"));
  assert.ok(route.includes("tx.create(caseRef"));
  assert.ok(route.includes("tx.create(staffAudit"));
  assert.ok(route.includes("tx.update(ref,{status:'approved'"));
  assert.ok(route.includes("personnelDataEnabled(process.env)"));
  assert.ok(route.includes("freshRoster()"));
});
test('Applicant form and cadre page both exist and show Firestore-only behavior',()=>{
  const page=read('public/roepnummer-aanvragen.html'),admin=read('public/roepnummers.html');
  assert.ok(page.includes("call('/api/callsigns/self','POST'"));
  assert.ok(page.includes('via <code>/info member</code>'));
  assert.ok(admin.includes('portalApprovalEnabled'));
  assert.ok(admin.includes('/api/callsigns/available'));
  assert.ok(admin.includes('Google Sheets wordt nooit gewijzigd'));
  assert.ok(!admin.includes('performPoliceSync'));
  assert.ok(read('src/discord-utils.js').includes("'/roepnummer-aanvragen.html'"));
  assert.ok(read('public/discord-status.html').includes("'/roepnummer-aanvragen.html'"));
});
