// Promotions as DOSSIER PROPOSALS only; never write a personnel grade.
import {TEST_RANKS} from './personnel-create.js';
import {roleForDepartment} from './leave-policy.js';

export const PROPOSAL_RANKS=Object.freeze([...TEST_RANKS.politie]);
const aliases=Object.freeze({
  AGENT:'Agent','AGENT VAN POLITIE':'Agent',AP:'Agent',AGP:'Agent',
  'ASPIRANT INSPECTEUR':'Aspirant Inspecteur',
  'ASPIRANT INSPECTEUR VAN POLITIE':'Aspirant Inspecteur',AINP:'Aspirant Inspecteur',
  INSPECTEUR:'Inspecteur','INSPECTEUR VAN POLITIE':'Inspecteur',INP:'Inspecteur',
  HOOFDINSPECTEUR:'Hoofdinspecteur','HOOFDINSPECTEUR VAN POLITIE':'Hoofdinspecteur',HINP:'Hoofdinspecteur'
});
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[._-]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
export function canonicalPromotionRank(rank){return aliases[normalized(rank)]||null}
export function promotionOptions(rank){
  const canonical=canonicalPromotionRank(rank);
  if(!canonical)return {current:null,next:null,higher:[]};
  const i=PROPOSAL_RANKS.indexOf(canonical);
  return {current:canonical,next:PROPOSAL_RANKS[i+1]||null,higher:PROPOSAL_RANKS.slice(i+1)};
}
export function canOverridePromotionProposal(actor,dept='politie'){
  // Alleen operationele korpsleiding in politie; geen globale, technische of
  // afzonderlijke bestuursrol mag zich deze uitzondering aanmeten.
  return dept==='politie'&&actor?.role==='korpsleiding'&&
    actor?.departments?.includes('politie')&&
    roleForDepartment(actor,'politie')==='korpsleiding';
}
export function validatePromotionProposal(raw,subject,actor){
  if(raw?.type!=='promotievoorstel')return {};
  if(subject?.dept!=='politie')throw Error('Promotievoorstellen volgens de politierangorde zijn alleen voor politie beschikbaar');
  const {current,next,higher}=promotionOptions(subject.rank);
  if(!current)throw Error('Huidige rang niet herkend; laat de personeelsrang eerst controleren');
  const target=canonicalPromotionRank(raw.proposedRank);
  if(!target||!higher.includes(target))throw Error('Voorgestelde rang moet hoger zijn dan de huidige rang');
  const wantsOverride=raw.promotionOverride===true;
  if(raw.promotionOverride!==undefined&&typeof raw.promotionOverride!=='boolean')
    throw Error('Ongeldige promotie-uitzondering');
  if(raw.proposedRank!==target)throw Error('Selecteer een geldige rang uit de officiële keuzelijst');
  if(target===next){
    if(wantsOverride||String(raw.promotionOverrideReason||'').trim())
      throw Error('Voor de eerstvolgende rang is geen uitzondering vereist');
    return {previousRank:current,proposedRank:target,promotionOverride:false};
  }
  if(!wantsOverride||!canOverridePromotionProposal(actor,'politie'))
    throw Error('Alleen korpsleiding mag een promotievoorstel boven de eerstvolgende rang maken');
  const reason=String(raw.promotionOverrideReason||'').trim();
  if(reason.length<20||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
    throw Error('Motivering uitzondering is verplicht (20 tot 500 tekens)');
  return {previousRank:current,proposedRank:target,promotionOverride:true,
    promotionOverrideReason:reason,promotionOverrideBy:actor.discordId||null,
    promotionOverrideRole:'korpsleiding'};
}
