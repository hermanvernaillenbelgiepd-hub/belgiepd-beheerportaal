import {roleForDepartment} from './leave-policy.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';

// This is a personnel-record change, NOT a Discord role/cadre assignment.
// Officer and corps authorisations always come from the verified portal session.
export const POLICE_RANK_CHOICES=Object.freeze([
  {rank:'Agent',hundreds:[1,2],grade:0},
  {rank:'Aspirant Inspecteur',hundreds:[3],grade:1},
  {rank:'Inspecteur',hundreds:[4],grade:2},
  {rank:'Eerste Inspecteur',hundreds:[5],grade:3},
  {rank:'Aspirant Hoofdinspecteur',hundreds:[6],grade:4},
  {rank:'Hoofdinspecteur',hundreds:[7],grade:5},
  {rank:'Eerste Hoofdinspecteur',hundreds:[8],grade:6},
  {rank:'Aspirant Commissaris',hundreds:[9],grade:7}
]);
export const policeRankByName=name=>POLICE_RANK_CHOICES.find(r=>r.rank===name)||null;
// Official labels are PRESENTATION ONLY. Internal rank decisions keep the
// stable short grade values used by the validated Firestore mutation flow.
const POLICE_RANK_PUBLIC_LABELS=Object.freeze({
 'Agent':'Agent van Politie (AP)',
 'Aspirant Inspecteur':'Aspirant Inspecteur van Politie (A-INP)',
 'Inspecteur':'Inspecteur van Politie (INP)',
 'Eerste Inspecteur':'Eerste Inspecteur van Politie (1INP)',
 'Aspirant Hoofdinspecteur':'Aspirant Hoofdinspecteur van Politie (A-HINP)',
 'Hoofdinspecteur':'Hoofdinspecteur van Politie (HINP)',
 'Eerste Hoofdinspecteur':'Eerste Hoofdinspecteur van Politie (1HINP)',
 'Aspirant Commissaris':'Aspirant Commissaris van Politie (ACP)'
});
export function policeOfficialRankLabel(rank){
 const value=String(rank||'').trim();
 return POLICE_RANK_PUBLIC_LABELS[value]||value;
}

/**
 * Some source-sheet personnel grades use extended descriptions (such as
 * "Aspirant Inspecteur van Politie (A-INP)") while the grade editor uses
 * the canonical short label. We may recover the grade from an official
 * callsign without changing the persisted source grade or granting rights.
 * A known canonical grade that conflicts with its callsign fails closed.
 */
export function policeSubjectGradeOption(subject){
  const byName=policeRankByName(subject?.rank);
  const callGrade=policeCallGrade(subject?.call);
  if(callGrade===null)return null;
  if(byName&&byName.grade!==callGrade)return null;
  return byName||POLICE_RANK_CHOICES.find(item=>item.grade===callGrade)||null;
}

export function policeCallNumber(call){
  const match=/^(?:S[- ]?)?([1-9]\d{2})$/i.exec(String(call||'').trim());
  return match?Number(match[1]):null;
}
export function policeCallGrade(call){
  const n=policeCallNumber(call);
  if(n===null||n===900||n===910)return null;
  return n>=920?7:Math.floor(n/100)===9?null:
    Math.floor(n/100)<=2?0:Math.floor(n/100)-2;
}
// Technical profile switching does not erase a separately approved,
// Discord-verified operational Police rank. Nor does technical access itself
// create any power to promote: only the preserved operational role plus
// independent Police Discord evidence can enable grade changes.
export function verifiedPoliceRankAuthority(actor){
  if(!actor||actor.uid!=='discord:'+actor.discordId||
     !actor.departments?.includes('politie'))return null;
  const technical=actor.portalTechnicalMode===true;
  if(technical&&actor.profileTechnicalAvailable!==true)return null;
  const role=technical?actor.operationalRole:actor.role;
  const scoped=technical?actor.operationalDepartmentRoles?.politie:
    roleForDepartment(actor,'politie');
  // Dual-appointed Bestuur/Korpsleiding members can have an administrative
  // profile while their signed Police service scope stays operational.
  // A separate CURRENT Discord Korpsleiding proof is still mandatory.
  const permittedProfile=role==='korpsleiding'||role==='officierenkader'||
    // A verified technical profile preserves the already approved
    // operational cadre. A Board profile without an operational scope
    // NEVER gains Police powers from the Board label alone.
    role==='beheerder'&&(technical&&actor.profileTechnicalAvailable===true||
      actor.boardPersonnelAdmin===true&&actor.dossierSourceFresh===true);
  if(!permittedProfile)return null;
  if(scoped==='korpsleiding'&&
     (actor.discordPoliceRank==='korpsleiding'||actor.manualCorpsApproved===true))
    return 'korpsleiding';
  if(scoped==='officierenkader'&&actor.discordPoliceRank==='officierenkader')
    return 'officierenkader';
  return null;
}
export function canChangePoliceGrade(actor,subject){
  if(!subject||subject.dept!=='politie'||actor?.discordId===subject.personId||
     actor?.uid!=='discord:'+actor?.discordId||
     !actor?.departments?.includes('politie')||
     !actor?.dossierNativeDepartments?.includes('politie')||
     !actor?.dossierAllowedDepartments?.includes('politie')||
     !canReadPersonnelSubject(actor,subject))
    return false;
  const cadre=verifiedPoliceRankAuthority(actor);
  if(!cadre)return false;
  // The Police-grade permission above is STRICTER and more specific than
  // generic personnel editing: it requires a matching approved Police cadre
  // AND independently verified Discord role. A Board/technical profile or
  // a stale generic editor flag must not veto that verified narrow permission.
  // Never reuse this exception for names, sanctions, Discord roles or other
  // personnel edits.
  const grade=policeCallGrade(subject.call);
  // Callsign and official personnel grade must not disagree on the cadre.
  if(grade===null||policeSubjectGradeOption(subject)===null)return false;
  if(cadre==='officierenkader'&&grade>6)return false;
  return true;
}
export function allowedPoliceGradeChoices(actor){
  const cadre=verifiedPoliceRankAuthority(actor);
  if(!cadre)return [];
  return POLICE_RANK_CHOICES.filter(item=>item.grade<=(cadre==='korpsleiding'?7:6))
    .map(item=>item.rank);
}
export function validatePoliceGradeChange(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>!['expectedRank','newRank','newCall','reason','expectedRevision'].includes(k)))
    throw Error('Ongeldige rangwijziging');
  const expectedRank=typeof body.expectedRank==='string'?body.expectedRank.trim():'';
  const newRank=typeof body.newRank==='string'?body.newRank.trim():'';
  const option=policeRankByName(newRank),newCall=String(body.newCall||'').trim();
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(!expectedRank||expectedRank.length>100||/[<>\x00-\x1f\x7f]/.test(expectedRank))
    throw Error('Huidige rang ontbreekt');
  if(!option||newRank===expectedRank)throw Error('Selecteer een andere toegelaten rang');
  const num=policeCallNumber(newCall);
  if(num===null||!option.hundreds.includes(Math.floor(num/100))||
     num===900||num===910||(Math.floor(num/100)===9&&num<920))
    throw Error('Het nieuwe roepnummer past niet bij de geselecteerde rang');
  if(reason.length<20||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
    throw Error('Motivering van 20 tot 500 tekens verplicht');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Vernieuw eerst de personeelsfiche');
  return {expectedRank,newRank,newCall,reason,expectedRevision:body.expectedRevision};
}
export function classifyPoliceGradeChange(previousCall,newCall){
  const a=policeCallGrade(previousCall),b=policeCallGrade(newCall);
  if(a===null||b===null||a===b)return 'rank_changed';
  return b>a?'promotion':'demotion';
}
