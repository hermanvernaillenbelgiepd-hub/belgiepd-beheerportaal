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
  // Evidence is produced SERVER-side from a recent, guild-bound Discord
  // snapshot. Police membership + a unique active 3xx-5xx Police personnel
  // record is sufficient for this OBSERVATION-ONLY submission. An explicit
  // higher Discord Police cadre always overrides the legacy roster.
  return Boolean(actor&&ID.test(actor.discordId)&&
    actor.uid==='discord:'+actor.discordId&&
    actor.portalTechnicalMode!==true&&(
      actor.discordPoliceRank==='basiskader'||
      (actor.discordPoliceRank==null&&actor.discordPoliceMemberVerified===true)
    ));
}
export function basicAuthor(actor,person){
  // A multi-service member may have a higher PRIMARY role (e.g. Brandweer
  // leadership) and an older portal approval with no Police department.
  // In that specific case, trust the independently verified Police Discord
  // Basiskader role PLUS the unique official 3xx-5xx Police staff identity.
  const approvedRole=roleForDepartment(actor,'politie');
  const approved=approvedRole==='basiskader'&&actor?.departments?.includes('politie');
  const verified=verifiedBasicPoliceIdentity(actor)&&(
    // A fresh, explicit Basiskader role can correct an old high portal role.
    // Mere Police membership may not override an explicit higher portal role.
    actor.discordPoliceRank==='basiskader'||
    !approvedRole||approvedRole==='basiskader'
  );
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

export function basicObservationAccessChecks(actor,people){
  const matches=(people||[]).filter(p=>p.dept==='politie'&&
    p.personId===actor?.discordId);
  const own=matches.length===1?matches[0]:null;
  return {
    discordIdentityVerified:Boolean(ID.test(actor?.discordId)&&
      actor?.uid==='discord:'+actor.discordId),
    policeRosterMatch:matches.length===1,
    rosterMatches:matches.length,
    policeCall:own?String(own.call||'').slice(0,24):null,
    policeCadreRecognized:own?basicCallLevel(own)!==null&&
      basicCallLevel(own)>=1&&basicCallLevel(own)<=3&&
      policeKader(own.rank,own.call)==='Basiskader':false,
    portalPoliceRole:roleForDepartment(actor,'politie')||null,
    discordPoliceRank:actor?.discordPoliceRank||null,
    policeMembershipVerified:actor?.discordPoliceMemberVerified===true
  };
}
export function basicObservationDenial(actor,people){
  const matches=(people||[]).filter(p=>p.dept==='politie'&&p.personId===actor?.discordId);
  if(matches.length!==1)
    return 'Je politiefiche is niet eenduidig gekoppeld aan je Discord-ID. Controleer de koppeling in Personeelsbeheer.';
  if(basicCallLevel(matches[0])===null||
     policeKader(matches[0].rank,matches[0].call)!=='Basiskader')
    return 'Je politiefiche heeft geen herkende Basiskaderrang (3xx–5xx). Laat roepnummer en rang controleren in Personeelsbeheer.';
  if(basicAuthor(actor,matches[0]))return null;
  const policeRole=roleForDepartment(actor,'politie');
  if(policeRole&&policeRole!=='basiskader')
    return 'Je portaalrol binnen Politie is geen Basiskaderrol. Gebruik Discord opnieuw verifiëren; bij een oude foutieve rol moet Gebruikersbeheer de indeling corrigeren.';
  if(policeRole==='basiskader')
    return 'Je politiefiche of goedgekeurde rol komt niet overeen met Basiskader. Controleer Personeelsbeheer.';
  return 'Je politiefiche is gevonden, maar de recente Discord-verificatie bevestigt geen Politie-lidmaatschap of Basiskaderrol. Klik rechtsboven op Discord opnieuw verifiëren; controleer zo nodig de Discord-rollen.';
}
export function basicObservationWritesEnabled(env=process.env){
  // Separately scoped, rank-checked observations can be enabled without
  // activating the wider sanction/registration module.
  return env.BPD_ENABLE_BASIC_OBSERVATIONS!=='false';
}
