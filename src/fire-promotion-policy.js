// Fire promotion recommendations are proposals and opinions, never grade edits.
import {validDate} from './management-utils.js';
const trim=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';
export const FIRE_PROMOTION_OPINION_VALUES=Object.freeze(['positief','negatief','onthouding']);
export function firePromotionInput(input,today){
 const eventDate=trim(input?.eventDate,10);
 const details=trim(input?.details,4000);
 const proposedRank=trim(input?.proposedRank,100);
 const reason=trim(input?.reason,500);
 if(!validDate(eventDate)||eventDate>today)throw Error('Ongeldige promotiedatum');
 if(proposedRank.length<3||proposedRank.length>100)throw Error('Voorgestelde graad moet 3–100 tekens bevatten');
 if(details.length<10||details.length>4000)throw Error('Toelichting moet 10–4000 tekens bevatten');
 if(reason.length<15||reason.length>500)throw Error('Motivering moet 15–500 tekens bevatten');
 return {type:'promotievoorstel',eventDate,details,proposedRank,reason,
  proposalStatus:'in_behandeling',opinions:[],reportCategory:'promotievoorstel'};
}
export function firePromotionOpinionInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).some(k=>!['opinion','reason'].includes(k)))
  throw Error('Ongeldig promotieadvies');
 const opinion=trim(value.opinion,30),reason=trim(value.reason,500);
 if(!FIRE_PROMOTION_OPINION_VALUES.includes(opinion))throw Error('Selecteer een geldig advies');
 if(reason.length<15||reason.length>500)throw Error('Een advies vereist een motivering van 15–500 tekens');
 return {opinion,reason};
}
export function updatedPromotionOpinions(previous,actor,value,at){
 const prior=Array.isArray(previous)?previous.filter(x=>x&&x.actorDiscordId!==actor.discordId)
  .slice(-29):[];
 return [...prior,{...value,actorDiscordId:actor.discordId,
  actorName:actor.name,actorCall:actor.call,at}];
}
export function firePublicProposal(record,id,{opinions=false}={}){
 const all=Array.isArray(record.opinions)?record.opinions:[];
 return {id,type:'promotievoorstel',eventDate:record.eventDate||'',
  details:String(record.details||'').slice(0,4000),
  proposedRank:String(record.proposedRank||'').slice(0,100),
  proposalStatus:record.proposalStatus||'in_behandeling',
  registeredBy:String(record.registeredBy?.name||'').slice(0,120),
  registeredCall:String(record.registeredBy?.call||'').slice(0,30),
  opinions:opinions?all.map(x=>({opinion:x.opinion,reason:x.reason,
   actorName:x.actorName,actorCall:x.actorCall,at:x.at?.toDate?.()?.toISOString?.()||null})):[],
  opinionCount:all.length};
}
