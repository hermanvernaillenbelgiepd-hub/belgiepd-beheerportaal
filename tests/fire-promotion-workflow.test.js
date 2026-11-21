import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fireMayProposePromotion,fireMayAdvisePromotion,fireMayCreate}
 from '../src/fire-dossier-policy.js';
import {firePromotionInput,firePromotionOpinionInput,updatedPromotionOpinions,firePublicProposal}
 from '../src/fire-promotion-policy.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='111111111111111111',actorId='222222222222222222';
const person={dept:'brandweer',personId:id,call:'BW-101',rank:'Brandweerman'};
const subjectRoles=new Set(['1309532438053130324']);
const middle={discordId:actorId,departments:['brandweer'],fireAccessLevel:'middle'};
const officer={...middle,fireAccessLevel:'leadership'};
const zone={...middle,fireAccessLevel:'zone',fireZoneChief:true};
test('Brandweer Middenkader mag promoveren voorstellen, maar kan geen promotie uitvoeren of adviseren',()=>{
 assert.equal(fireMayProposePromotion(middle,person,subjectRoles),true);
 assert.equal(fireMayCreate(middle,person,subjectRoles,'promotievoorstel'),true);
 assert.equal(fireMayAdvisePromotion(middle,person,subjectRoles),false);
 assert.equal(fireMayCreate(middle,person,subjectRoles,'personeelsbeweging'),false);
 assert.equal(fireMayProposePromotion({...middle,discordId:id},person,subjectRoles),false);
 assert.equal(fireMayAdvisePromotion(officer,person,subjectRoles),true);
 assert.equal(fireMayCreate(officer,person,subjectRoles,'personeelsbeweging'),true);
 assert.equal(fireMayAdvisePromotion(zone,person,subjectRoles),true);
});
test('Voorstellen, meningen en herzieningen zijn gevalideerd en geaudit zonder rangwijziging',()=>{
 const proposal=firePromotionInput({eventDate:'2026-11-19',proposedRank:'Korporaal',
  details:'Positieve operationele beoordelingen en langdurige ervaring',
  reason:'Gerechtvaardigd voorstel op basis van opleidings- en diensthistoriek'},'2026-11-19');
 assert.equal(proposal.type,'promotievoorstel');
 assert.equal(proposal.proposalStatus,'in_behandeling');
 assert.throws(()=>firePromotionInput({...proposal,eventDate:'2026-11-20'},'2026-11-19'),/Ongeldige promotiedatum/);
 const advice=firePromotionOpinionInput({opinion:'positief',
  reason:'Voldoende ervaring en aantoonbare verantwoordelijkheid'});
 assert.equal(advice.opinion,'positief');
 assert.throws(()=>firePromotionOpinionInput({opinion:'goedgekeurd',
  reason:'Voldoende ervaring en aantoonbare verantwoordelijkheid'}),/Selecteer een geldig advies/);
 const actor={discordId:actorId,name:'Officier',call:'OOFF-01'};
 const first=updatedPromotionOpinions([],actor,advice,'2026-11-19T12:00:00Z');
 assert.equal(first.length,1);
 const changed=updatedPromotionOpinions(first,actor,{...advice,opinion:'onthouding'},'2026-11-19T14:00:00Z');
 assert.equal(changed.length,1);
 assert.equal(changed[0].opinion,'onthouding');
 const privateView=firePublicProposal({...proposal,opinions:first},'entry');
 assert.equal(privateView.opinionCount,1);
 assert.equal(privateView.opinions.length,0);
 assert.equal(firePublicProposal({...proposal,opinions:first},'entry',{opinions:true}).opinions.length,1);
});
test('Dossier bevat afzonderlijke voorstellen, personeelsbewegingen en officiersadviezen',()=>{
 const api=source('src/fire-dossier-routes.js');
 const ui=source('public/brandweerdossier.html');
 const report=source('src/management-utils.js');
 assert.ok(api.includes("app.post('/api/fire-dossiers/:discordId/promotions/:entryId/opinion'"));
 assert.ok(api.includes("tx.create(ref.collection('audit').doc(),audit)"));
 assert.ok(api.includes('rankChanged:false,discordRolesChanged:false'));
 assert.ok(api.includes("type==='personeelsbeweging'"));
 assert.ok(api.includes("type==='promotievoorstel'"));
 assert.ok(ui.includes('id="promotionRecords"'));
 assert.ok(ui.includes('id="movementType"'));
 assert.ok(ui.includes('id="proposedRank"'));
 assert.ok(ui.includes('Opleiding registreren / register'));
 assert.ok(report.includes("promotievoorstel:'Promotievoorstel'"));
 assert.ok(report.includes("personeelsbeweging:'Personeelsbeweging'"));
});
