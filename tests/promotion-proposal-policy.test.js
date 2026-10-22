import test from 'node:test';
import assert from 'node:assert/strict';
import {TEST_RANKS} from '../src/personnel-create.js';
import {canonicalPromotionRank,promotionOptions,canOverridePromotionProposal,
  validatePromotionProposal,PROPOSAL_RANKS} from '../src/promotion-proposal-policy.js';

const officer={role:'officierenkader',departments:['politie'],departmentRoles:{politie:'officierenkader'},discordId:'111111111111111111'};
const corps={role:'korpsleiding',departments:['politie'],departmentRoles:{politie:'korpsleiding'},discordId:'222222222222222222'};
const subject=rank=>({dept:'politie',rank});
const request=(proposedRank,opts={})=>({type:'promotievoorstel',proposedRank,...opts});
const reason='Goed onderbouwde uitzondering op de normale promotievolgorde voor dit dossier.';

test('Voorstellen gebruiken exact de bestaande, beheerde politierangorde',()=>{
  assert.deepEqual(PROPOSAL_RANKS,TEST_RANKS.politie);
  assert.equal(canonicalPromotionRank('Agent van politie'),'Agent');
  assert.equal(canonicalPromotionRank('Aspirant-inspecteur van politie'),'Aspirant Inspecteur');
  assert.equal(canonicalPromotionRank('Hoofdinspecteur van politie'),'Hoofdinspecteur');
  assert.equal(promotionOptions('Agent van politie').next,'Aspirant Inspecteur');
  assert.equal(promotionOptions('Inspecteur').next,'Hoofdinspecteur');
  assert.equal(promotionOptions('Hoofdinspecteur').next,null);
});
test('Iedere gewone promotie is uitsluitend naar de eerstvolgende rang',()=>{
  assert.deepEqual(validatePromotionProposal(request('Aspirant Inspecteur'),subject('Agent van politie'),officer),{
    previousRank:'Agent',proposedRank:'Aspirant Inspecteur',promotionOverride:false
  });
  for(const target of ['Agent','Inspecteur','Hoofdinspecteur','Niet-bestaande graad']){
    assert.throws(()=>validatePromotionProposal(request(target),subject('Agent'),officer));
  }
  assert.throws(()=>validatePromotionProposal(request('Agent'),subject('Hoofdinspecteur'),officer));
  assert.throws(()=>validatePromotionProposal(request('Inspecteur'),subject('Onbekende rang'),officer));
});
test('Alleen geverifieerde politie-korpsleiding mag een sprong met reden indienen',()=>{
  assert.equal(canOverridePromotionProposal(corps),true);
  assert.equal(canOverridePromotionProposal(officer),false);
  assert.equal(canOverridePromotionProposal({...corps,role:'beheerder'}),false);
  assert.equal(canOverridePromotionProposal({...corps,departmentRoles:{politie:'middenkader'}}),false);
  assert.throws(()=>validatePromotionProposal(request('Inspecteur',{
    promotionOverride:true,promotionOverrideReason:reason
  }),subject('Agent'),officer),/Alleen korpsleiding/);
  assert.throws(()=>validatePromotionProposal(request('Inspecteur',{
    promotionOverride:true,promotionOverrideReason:'Te kort'
  }),subject('Agent'),corps),/Motivering/);
  assert.throws(()=>validatePromotionProposal(request('Inspecteur'),subject('Agent'),corps),/Alleen korpsleiding/);
  const result=validatePromotionProposal(request('Inspecteur',{
    promotionOverride:true,promotionOverrideReason:reason
  }),subject('Agent van politie'),corps);
  assert.equal(result.promotionOverride,true);
  assert.equal(result.previousRank,'Agent');
  assert.equal(result.proposedRank,'Inspecteur');
  assert.equal(result.promotionOverrideBy,corps.discordId);
  assert.equal(result.promotionOverrideReason,reason);
});
test('Een uitzondering is nooit een willekeurige of lagere rang en vereist politie',()=>{
  assert.throws(()=>validatePromotionProposal(request('Agent',{
    promotionOverride:true,promotionOverrideReason:reason
  }),subject('Inspecteur'),corps));
  assert.throws(()=>validatePromotionProposal(request('Commissaris',{
    promotionOverride:true,promotionOverrideReason:reason
  }),subject('Agent'),corps));
  assert.throws(()=>validatePromotionProposal(request('Aspirant Inspecteur',{
    promotionOverride:true,promotionOverrideReason:reason
  }),subject('Agent'),corps),/geen uitzondering/);
  assert.throws(()=>validatePromotionProposal(request('Inspecteur',{
    promotionOverride:true,promotionOverrideReason:reason
  }),{dept:'brandweer',rank:'Brandweerman'},corps));
});
