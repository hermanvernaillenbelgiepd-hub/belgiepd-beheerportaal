import {roleForDepartment} from './leave-policy.js';
import {policeKader} from './normalize.js';
const ID=/^\d{15,22}$/;
export function basicCallLevel(person){
  if(person?.dept!=='politie')return null;
  const call=String(person.call||'').trim();
  // Personnel identifiers can use e.g. 432, S432 or SANTO-432.
  // Use the same general prefix convention as policeKader/normalize.js.
  const match=/^(?:[a-z]+[- ]?)?([1-5]\d{2})$/i.exec(call);
  if(!match)return null;
  const digit=Number(match[1][0]);
  // 1xx and 2xx share the same Agent rank.
  return digit<=2?0:digit-2;
}
export function verifiedBasicPoliceIdentity(actor){
  // Evidence is produced SERVER-side from a fresh, guild-bound Discord role
  // snapshot. It does not grant general police dossiers, ranks or management.
  return Boolean(actor&&ID.test(actor.discordId)&&
    actor.uid==='discord:'+actor.discordId&&
    actor.discordPoliceRank==='basiskader'&&
    actor.portalTechnicalMode!==true);
}
export function basicAuthor(actor,person){
  // A multi-service member may have a higher PRIMARY role (e.g. Brandweer
  // leadership) and an older portal approval with no Police department.
  // In that specific case, trust the independently verified Police Discord
  // Basiskader role PLUS the unique official 3xx-5xx Police staff identity.
  const approvedRole=roleForDepartment(actor,'politie');
  const approved=approvedRole==='basiskader'&&actor?.departments?.includes('politie');
  const verified=(!approvedRole||approvedRole==='basiskader')&&
    verifiedBasicPoliceIdentity(actor);
  if(!actor||!(approved||verified)||!ID.test(actor.discordId)||
     !person||person.personId!==actor.discordId||person.dept!=='politie')return false;
  const lvl=basicCallLevel(person);
  return lvl!==null&&lvl>=1&&lvl<=3&&
    policeKader(person.rank,person.call)==='Basiskader';
}
export function basicEligibleTarget(actorPerson,target){
  const sender=basicCallLevel(actorPerson),recipient=basicCallLevel(target);
  if(sender===null||sender<1||sender>3||recipient===null||
     !ID.test(target?.personId)||target.personId===actorPerson.personId||
     recipient>=sender)return false;
  const rank=policeKader(target.rank,target.call);
  return recipient===0?rank==='Agentenkader':rank==='Basiskader';
}
export function basicObservationTargets(actor,people){
  const matches=(people||[]).filter(p=>p.dept==='politie'&&p.personId===actor?.discordId);
  if(matches.length!==1||!basicAuthor(actor,matches[0]))return {author:null,targets:[]};
  const counts=new Map();
  for(const p of people||[])if(p.dept==='politie')counts.set(p.personId,(counts.get(p.personId)||0)+1);
  return {author:matches[0],targets:(people||[]).filter(p=>counts.get(p.personId)===1&&
    basicEligibleTarget(matches[0],p))};
}
export const mayReadBasicInbox=actor=>Boolean(actor?.boardPersonnelAdmin===true||
  (actor?.departments?.includes('politie')&&
    actor?.dossierAllowedDepartments?.includes('politie')&&
    ['middenkader','officierenkader','korpsleiding'].includes(
      roleForDepartment(actor,'politie'))));

export function basicObservationDenial(actor,people){
  const matches=(people||[]).filter(p=>p.dept==='politie'&&p.personId===actor?.discordId);
  if(matches.length!==1)
    return 'Geen unieke politiefiche gevonden voor jouw Discord-ID. Controleer de koppeling in Personeelsbeheer.';
  if(basicCallLevel(matches[0])===null)
    return 'Je politiroepnummer wordt niet herkend als een geldig Basiskader-nummer (3xx–5xx).';
  if(basicAuthor(actor,matches[0]))return null;
  const policeRole=roleForDepartment(actor,'politie');
  if(policeRole&&policeRole!=='basiskader')
    return 'Geen goedgekeurde Basiskaderrol binnen Politie: controleer de politierol in Gebruikersbeheer.';
  if(policeRole==='basiskader')
    return 'Je politiefiche of goedgekeurde rol komt niet overeen met Basiskader. Controleer Personeelsbeheer.';
  return 'Er is wel een politiefiche, maar je Discord-Basiskaderrol is niet recent bevestigd. Klik rechtsboven op Discord opnieuw verifiëren. Blijft dit zo, controleer de Politierol in Gebruikersbeheer.';
}
export function basicObservationWritesEnabled(env=process.env){
  // Separately scoped, rank-checked observations can be enabled without
  // activating the wider sanction/registration module.
  return env.BPD_ENABLE_BASIC_OBSERVATIONS!=='false';
}
