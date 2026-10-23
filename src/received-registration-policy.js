import {policeKader} from './normalize.js';
import {roleForDepartment} from './leave-policy.js';

// Ontvangen observaties/registraties worden ingedeeld op basis van
// de geverifieerde, actuele personeelsfiche van de IND IENER.
// Het "onBehalfOf"-veld kan deze rubriek nooit beïnvloeden.
const GROUPS=Object.freeze({
  Agentenkader:'basiskader',Basiskader:'basiskader',Middenkader:'middenkader'
});
const LEVELS=Object.freeze({
  Agentenkader:0,Basiskader:1,Middenkader:2,
  Officierenkader:3,Korpsleiding:4
});
const id=id=>/^\d{15,22}$/.test(String(id||''));
export const receivedGroup=person=>{
  if(!person||person.dept!=='politie')return null;
  return GROUPS[policeKader(person.rank,person.call)]||null;
};
export const staffCadreLevel=person=>{
  if(!person||person.dept!=='politie')return null;
  const rank=policeKader(person.rank,person.call);
  // Nummer 9xx op zichzelf zegt niet of dit officierenkader dan wel
  // korpsleiding is: behandelen als ten minste officierenkader.
  if(rank==='Officierenkader / Korpsleiding'||rank==='Kader')return 3;
  return Number.isInteger(LEVELS[rank])?LEVELS[rank]:null;
};
export const receivedAccess=(actor,target)=>{
  if(target?.dept!=='politie'||!id(target?.personId)||
     !actor?.dossierNativeDepartments?.includes('politie')||
     !actor?.dossierAllowedDepartments?.includes('politie')||
     !actor?.departments?.includes('politie'))return [];
  const role=roleForDepartment(actor,'politie');
  if(!['middenkader','officierenkader','korpsleiding'].includes(role))return [];
  const ownTier=role==='middenkader'?2:role==='officierenkader'?3:4;
  const subjectTier=staffCadreLevel(target);
  if(subjectTier===null||subjectTier>=ownTier)return [];
  return role==='middenkader'?['basiskader']:['basiskader','middenkader'];
};
export const receivedAuthor=(entry,people)=>{
  const author=entry?.submittedByActor?.discordId||entry?.registeredBy?.discordId;
  if(!id(author))return null;
  const hits=(people||[]).filter(p=>p.dept==='politie'&&p.personId===author);
  if(hits.length!==1)return null;
  const person=hits[0],bucket=receivedGroup(person);
  return bucket?{bucket,discordId:author,name:person.name,call:person.call,
    rank:person.rank}:null;
};
