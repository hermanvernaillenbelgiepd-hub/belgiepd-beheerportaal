import {roleForDepartment} from './leave-policy.js';
import {canReadPersonnelSubject,canEditPersonnel} from './personnel-editor-policy.js';

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
export function canChangePoliceGrade(actor,subject){
  if(!subject||subject.dept!=='politie'||actor?.discordId===subject.personId||
     actor?.uid!=='discord:'+actor?.discordId||
     !actor?.departments?.includes('politie')||
     !actor?.dossierNativeDepartments?.includes('politie')||
     !actor?.dossierAllowedDepartments?.includes('politie')||
     !canReadPersonnelSubject(actor,subject)||!canEditPersonnel(actor,subject))
    return false;
  const scoped=roleForDepartment(actor,'politie');
  const officer=actor.role==='officierenkader'&&scoped==='officierenkader'&&
    actor.discordPoliceRank==='officierenkader';
  const corps=actor.role==='korpsleiding'&&scoped==='korpsleiding'&&
    (actor.discordPoliceRank==='korpsleiding'||actor.manualCorpsApproved===true);
  if(!officer&&!corps)return false;
  const grade=policeCallGrade(subject.call);
  // Callsign and official personnel grade must not disagree on the cadre.
  if(grade===null)return false;
  if(officer&&grade>6)return false;
  return true;
}
export function allowedPoliceGradeChoices(actor){
  const corps=actor?.role==='korpsleiding'&&
    roleForDepartment(actor,'politie')==='korpsleiding'&&
    (actor.discordPoliceRank==='korpsleiding'||actor.manualCorpsApproved===true);
  return POLICE_RANK_CHOICES.filter(item=>item.grade<=(corps?7:6))
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
