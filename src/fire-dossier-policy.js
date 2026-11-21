import {verifiedBoardCorpsDossierAdmin} from './board-corps-dossier-policy.js';
export const FIRE_ROLES=Object.freeze({member:'1309532438053130324',middle:'1554906632897560787',leadership:'1395115819020714105',teacher:'1309532437952466989'});
export const FIRE_COURSES=Object.freeze([
{name:'Logistiek / Signalisatie',roleId:'1309532437952466986'},
{name:'Ladderwagen',roleId:'1399000349037166664'},
{name:'Duiker',roleId:'1309532437952466985'},
{name:'Bosbestrijding',roleId:'1399006120965570670'},
{name:'Brandweer-AMBU',roleId:'1466508322566967609'},
{name:'RED-TEAM',roleId:null},
{name:'Gevaarlijke stoffen',roleId:null},
{name:'Basistraining',roleId:null}
]);
const ID=new RegExp('^[0-9]{15,22}$');
export function verifiedFireRoles(member,guildId,now=Date.now()){
 if(!ID.test(String(guildId||''))||!member||member.guildId!==guildId||
 !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
 now-member.verifiedAt>15*60*1000||!Array.isArray(member.roleIds)||
 !member.roleIds.every(id=>ID.test(id)))return null;
 return new Set(member.roleIds);
}
export function fireSubjectClass(subject,roles){
  if(!subject||subject.dept!=='brandweer')return 'none';
  // Een actuele officiële Brandweerpersoneelslijst is een bron voor de
  // doelpersoon, nooit een bron voor de bevoegdheid van de ingelogde gebruiker.
  const duty=String(subject.call||'').trim().toUpperCase();
  const rank=String(subject.rank||'').trim().toUpperCase();
  if(roles?.has(FIRE_ROLES.leadership)||
     /^(?:ZONE|OFF)(?:$|[- ]|[0-9])/.test(duty)||
     /\b(?:ZONECHEF|ZONECOMMANDANT|KOLONEL|MAJOOR|KAPITEIN|LUITENANT|HOGER KADER)\b/.test(rank))
    return 'leadership';
  if(roles?.has(FIRE_ROLES.middle)||
     /^(?:OOFF|OOF)[- ]?\d{1,3}$/.test(duty)||
     /\b(?:ADJUDANT|SERGEANT|MIDDENKADER)\b/.test(rank))
    return 'middle';
  // Bekende basis- en stagefuncties blijven selecteerbaar bij een verlopen
  // individuele Discord-cache. Een onbekend profiel blijft afgeschermd.
  if(/^STAG(?:IAIR)?[- ]?\d{0,3}$/.test(duty)||/\bSTAGIAIR\b/.test(rank))
    return 'trainee';
  if(roles?.has(FIRE_ROLES.member)||
     /^(?:BWM|BMW|BW)[- ]?\d{1,3}$/.test(duty)||
     /\b(?:KORPORAAL|BRANDWEERMAN|BRANDWEERVROUW)\b/.test(rank))
    return 'member';
  return 'unverified';
}
export function fireActorClass(actor,roles){
 if(!actor?.departments?.includes('brandweer'))return 'none';
 if(actor.fireZoneChief===true)return 'zone';
 if(actor.manualFireRole==='leadership')return 'leadership';
 if(actor.manualFireRole==='middle')return 'middle';
 if(!roles)return 'none';
 if(roles.has(FIRE_ROLES.leadership))return 'leadership';
 if(roles.has(FIRE_ROLES.middle))return 'middle';
 return 'none';
}
export function mayOpenFireSubject(actor,subject,subjectRoles){
  if(!subject||subject.dept!=='brandweer')return false;
  if(actor?.boardPersonnelAdmin===true||actor?.fireZoneChief===true||
     actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true)return true;
  if(!actor?.departments?.includes('brandweer'))return false;
  if(actor.fireAccessLevel==='leadership')return true;
  return actor.fireAccessLevel==='middle'&&
    ['member','trainee'].includes(fireSubjectClass(subject,subjectRoles));
}
export function fireRecordVisibility(actor,subject,subjectRoles){
 if(!mayOpenFireSubject(actor,subject,subjectRoles))return 'none';
 if(actor?.fireZoneChief===true||actor?.boardPersonnelAdmin===true||
    actor?.portalTechnicalMode===true)return 'full';
 return actor?.fireAccessLevel==='leadership'?'leadership':'identity';
}
export function fireCanWithdrawSanction(actor,subject,subjectRoles){
  return Boolean(actor?.discordId!==subject?.personId&&
    (verifiedBoardCorpsDossierAdmin(actor)||actor?.fireZoneChief===true||
      actor?.fireAccessLevel==='leadership'&&actor?.departments?.includes('brandweer')||
      actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true)&&
    ['full','leadership'].includes(fireRecordVisibility(actor,subject,subjectRoles)));
}
export function fireSanctionLevel(actor){
  if(verifiedBoardCorpsDossierAdmin(actor)||actor?.fireZoneChief===true||
     actor?.portalTechnicalMode===true&&actor?.profileTechnicalAvailable===true)
    return 'korpsleiding';
  return actor?.fireAccessLevel==='leadership'&&
    actor?.departments?.includes('brandweer')?'korpsleiding':null;
}
// Promotievoorstellen blijven advies, zonder automatische rang-/rolwijziging.
export function fireMayProposePromotion(actor,subject,subjectRoles){
 if(!actor||!subject||actor.discordId===subject.personId)return false;
 const scope=fireRecordVisibility(actor,subject,subjectRoles);
 return (actor.fireAccessLevel==='middle'&&scope==='identity')||
  (actor.fireAccessLevel==='leadership'&&scope==='leadership')||
  (actor.fireZoneChief===true&&scope==='full')||
  (actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true&&scope==='full');
}
export function fireMayAdvisePromotion(actor,subject,subjectRoles){
 if(!actor||!subject||actor.discordId===subject.personId)return false;
 const scope=fireRecordVisibility(actor,subject,subjectRoles);
 return (actor.fireAccessLevel==='leadership'&&scope==='leadership')||
  (actor.fireZoneChief===true&&scope==='full');
}
export function fireMayCreate(actor,subject,subjectRoles,type){
  if(type==='promotievoorstel')return fireMayProposePromotion(actor,subject,subjectRoles);
  if(!actor||!subject||actor.discordId===subject.personId)return false;
  if(verifiedBoardCorpsDossierAdmin(actor))
    return ['observatie','basisnotitie','notitie','sanctie'].includes(type);
  const scope=fireRecordVisibility(actor,subject,subjectRoles);
  if(actor?.boardPersonnelAdmin===true&&!actor?.fireZoneChief&&
     actor?.portalTechnicalMode!==true)return false;
  if(scope==='identity')
    return ['observatie','basisnotitie','notitie'].includes(type);
  if(scope==='leadership'||scope==='full')
    return ['observatie','basisnotitie','notitie','sanctie','personeelsbeweging'].includes(type);
  return false;
}
