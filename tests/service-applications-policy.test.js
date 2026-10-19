import test from 'node:test';
import assert from 'node:assert/strict';
import {assessServiceApplicant,serviceApplicantDossierId,
  validateServiceApplicationDraft} from '../src/service-applications-policy.js';

const now=Date.UTC(2026,9,20,12,0,0);
const evidence={
  source:'trusted_fivem_server',totalPlaySeconds:10*3600,
  firstServerJoinAt:new Date(now-5*86400000).toISOString(),
  verifiedAt:new Date(now-10000).toISOString()
};
test('Two independent trusted conditions allow non-police applications',()=>{
 assert.equal(assessServiceApplicant(evidence,now).status,'eligible');
 assert.equal(assessServiceApplicant(evidence,now).eligible,true);
 assert.equal(assessServiceApplicant({...evidence,totalPlaySeconds:35999},now).eligible,false);
 assert.equal(assessServiceApplicant({...evidence,
   firstServerJoinAt:new Date(now-5*86400000+1).toISOString()},now).eligible,false);
 assert.equal(assessServiceApplicant({...evidence,totalPlaySeconds:0},now).status,'not_yet_eligible');
});
test('Self reported or stale telemetry never makes applicants eligible',()=>{
 assert.equal(assessServiceApplicant(null,now).status,'verification_required');
 assert.equal(assessServiceApplicant({...evidence,source:'user_form'},now).status,'verification_required');
 assert.equal(assessServiceApplicant({...evidence,source:'discord_join'},now).status,'verification_required');
 assert.equal(assessServiceApplicant({...evidence,totalPlaySeconds:10.5},now).status,'verification_required');
 assert.equal(assessServiceApplicant({...evidence,
   verifiedAt:new Date(now-25*3600000).toISOString()},now).status,'verification_required');
 assert.equal(assessServiceApplicant({...evidence,firstServerJoinAt:'not-a-date'},now).status,'verification_required');
 assert.equal(assessServiceApplicant({...evidence,
   verifiedAt:new Date(now+120000).toISOString()},now).status,'verification_required');
});
test('Separate department + verified identity yields independent applicant dossiers',()=>{
 const id='123456789012345678';
 assert.equal(serviceApplicantDossierId('ambulance',id),'ambulance_'+id);
 assert.equal(serviceApplicantDossierId('brandweer',id),'brandweer_'+id);
 assert.equal(serviceApplicantDossierId('depannage',id),'depannage_'+id);
 for(const dept of ['burger','politie','admin',''])assert.throws(()=>serviceApplicantDossierId(dept,id));
 assert.throws(()=>serviceApplicantDossierId('ambulance','fake'));
});
test('Candidate cannot supply privileged identity, rank or eligibility claims',()=>{
 const good={dept:'ambulance',motivation:'Ik wil de ambulance helpen en opleiding volgen in deze dienst, met voldoende inzet.'};
 assert.deepEqual(validateServiceApplicationDraft(good),good);
 for(const bad of [{rank:'Commissaris'},{status:'approved'},{discordId:'123456789012345678'},
                   {playHours:10},{firstServerJoinAt:evidence.firstServerJoinAt},
                   {approvedBy:'kader'}]){
   assert.throws(()=>validateServiceApplicationDraft({...good,...bad}));
 }
 assert.throws(()=>validateServiceApplicationDraft({...good,dept:'politie'}));
 assert.throws(()=>validateServiceApplicationDraft({...good,motivation:'te kort'}));
});
