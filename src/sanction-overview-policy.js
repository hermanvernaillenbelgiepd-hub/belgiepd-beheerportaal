import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {verifiedBoardCorpsDossierAdmin} from './board-corps-dossier-policy.js';

export const SANCTION_OVERVIEW_DEPARTMENTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
export const SANCTION_OVERVIEW_PAGE_SIZE=240;
const DISCORD=/^\d{15,22}$/;
const VALID_ENTRY=/^[a-zA-Z0-9_-]{8,120}$/;
export const validSanctionReference=(dept,id,entryId)=>
  SANCTION_OVERVIEW_DEPARTMENTS.includes(dept)&&DISCORD.test(String(id||''))&&
  VALID_ENTRY.test(String(entryId||''));

export function canReviewSanctions(actor,dept){
 if(!SANCTION_OVERVIEW_DEPARTMENTS.includes(dept)||
    !DISCORD.test(String(actor?.discordId||''))||
    actor?.uid!=='discord:'+actor.discordId||
    !canReadServiceDossier(actor,dept))return false;
 if(actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true)
  return true;
 if(verifiedBoardCorpsDossierAdmin(actor))return true;
 const scoped=roleForDepartment(actor,dept);
 return ['officierenkader','korpsleiding'].includes(actor.role)&&
  ['officierenkader','korpsleiding'].includes(scoped)&&
  actor?.dossierNativeDepartments?.includes(dept)===true;
}
export function canSeeSanctionSubject(actor,subject){
 return Boolean(subject&&canReviewSanctions(actor,subject.dept)&&
  canReadPersonnelSubject(actor,subject));
}
export function validateSanctionFollowup(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==1||!Object.hasOwn(value,'text')||
    typeof value.text!=='string')throw Error('Geef één opvolgnotitie op');
 const text=value.text.trim();
 if(text.length<10||text.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
  throw Error('Een opvolgnotitie vereist 10 tot 2000 geldige tekens');
 return text;
}
export function safeSanctionActor(value){
 return {name:String(value?.name||'Onbekend').slice(0,120),
  call:String(value?.call||'').slice(0,24),
  rank:String(value?.rank||'').slice(0,120)};
}
export function sanctionOverviewItem(entry,subject,id){
 return {
  id,dept:subject.dept,discordId:subject.personId,
  name:String(subject.name||'Personeelslid').slice(0,120),
  call:String(subject.call||'').slice(0,24),
  currentRank:String(subject.rank||'').slice(0,120),
  rankAtSanction:String(entry.subjectRankAtCreation||'').slice(0,120),
  callAtSanction:String(entry.subjectCallAtCreation||'').slice(0,24),
  eventDate:String(entry.eventDate||'').slice(0,10),
  eventTime:String(entry.eventTime||'').slice(0,5),
  sanctionType:String(entry.sanctionType||'Sanctie').slice(0,100),
  severity:Number.isInteger(entry.severity)?entry.severity:null,
  status:String(entry.status||'actief').slice(0,30),
  reasons:Array.isArray(entry.reasons)?entry.reasons.filter(x=>typeof x==='string').slice(0,12):[],
  reasonOther:String(entry.reasonOther||'').slice(0,500),
  issuer:safeSanctionActor(entry.registeredBy),
  historicalImport:entry.historicalImport===true,
  testRecord:entry.testRecord===true
 };
}
