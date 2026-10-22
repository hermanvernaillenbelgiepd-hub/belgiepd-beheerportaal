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
  assert.equal(promotionOptions('Inspecteur').next,'Eerste Inspecteur');
  assert.equal(promotionOptions('Hoofdinspecteur').next,'Eerste Hoofdinspecteur');
  assert.equal(promotionOptions('Eerste Hoofdinspecteur').next,null);
});
test('Iedere gewone promotie is uitsluitend naar de eerstvolgende rang',()=>{
  assert.deepEqual(validatePromotionProposal(request('Aspirant Inspecteur'),subject('Agent van politie'),officer),{
    previousRank:'Agent',proposedRank:'Aspirant Inspecteur',promotionOverride:false
  });
  for(const target of ['Agent','Inspecteur','Eerste Inspecteur','Hoofdinspecteur','Niet-bestaande graad']){
    assert.throws(()=>validatePromotionProposal(request(target),subject('Agent'),officer));
  }
  assert.throws(()=>validatePromotionProposal(request('Agent'),subject('Hoofdinspecteur'),officer));
  assert.deepEqual(validatePromotionProposal(request('Eerste Inspecteur'),subject('Inspecteur'),officer),{previousRank:'Inspecteur',proposedRank:'Eerste Inspecteur',promotionOverride:false});
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

test('1xx en 2xx zijn AP; eerstvolgende rang is 3xx A-INP, geen promotie tussen AP-reeksen',()=>{
  for(const call of ['150','S188','TEST-201','235']){
    const actual={dept:'politie',rank:'AP',call};
    assert.equal(promotionOptions(actual.rank,call).callBand.kader,'agentenkader');
    assert.equal(promotionOptions(actual.rank,call).next,'Aspirant Inspecteur');
    assert.deepEqual(validatePromotionProposal(request('Aspirant Inspecteur'),actual,officer),{
      previousRank:'Agent',proposedRank:'Aspirant Inspecteur',promotionOverride:false
    });
  }
});
test('Roepnummerreeks 3xx–8xx valideert alle aangegeven politiegraden',()=>{
  const subjects=[
    ['S302','A-INP','Aspirant Inspecteur','Inspecteur'],
    ['450','INP','Inspecteur','Eerste Inspecteur'],
    ['TEST-540','1-INP','Eerste Inspecteur','Aspirant Hoofdinspecteur'],
    ['650','A-HINP','Aspirant Hoofdinspecteur','Hoofdinspecteur'],
    ['750','HINP','Hoofdinspecteur','Eerste Hoofdinspecteur'],
    ['850','1-HINP','Eerste Hoofdinspecteur',null]
  ];
  for(const [call,rank,current,next] of subjects){
    const options=promotionOptions(rank,call);
    assert.equal(options.current,current);
    assert.equal(options.next,next);
    assert.equal(options.conflict,false);
    if(next)assert.equal(validatePromotionProposal(request(next),{dept:'politie',call,rank},officer).previousRank,current);
  }
});
test('Misleidende roepnummer-rangcombinaties blokkeren voorstel totdat dossier is gecorrigeerd',()=>{
  const options=promotionOptions('Hoofdinspecteur','S302');
  assert.equal(options.conflict,true);
  assert.equal(options.next,null);
  assert.throws(()=>validatePromotionProposal(request('Eerste Hoofdinspecteur'),{
    dept:'politie',call:'S302',rank:'Hoofdinspecteur'
  },officer),/Roepnummer/);
});
test('9xx geeft alleen Officierenkader of Korpsleiding aan, geen verzonnen officiersrang',()=>{
  const options=promotionOptions('Commissaris','950');
  assert.equal(options.current,null);
  assert.equal(options.callBand.kader,'officierenkader/korpsleiding');
  assert.equal(options.callBand.rank,null);
  assert.equal(options.next,null);
});
