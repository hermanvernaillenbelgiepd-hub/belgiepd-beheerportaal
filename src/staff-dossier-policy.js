import {canEditGeneralPersonnelInfo,validPersonnelKey} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';

export const STAFF_DOSSIER_COLLECTION='bpd_staff_dossiers';
// Historical categories are retained for read-only access, not for new writes.
export const STAFF_NOTE_TYPES=Object.freeze(['opleiding','begeleiding','evaluatie','administratief','waardering']);
const FIELDS=Object.freeze(['startDate','unit','functionTitle']);
const DEFAULT=Object.freeze({startDate:'',unit:'',functionTitle:''});
const safeText=(value,max)=>{
  if(typeof value!=='string')throw Error('Ongeldige tekstwaarde');
  const text=value.trim();
  if(text.length>max||/[\x00-\x1f\x7f<>]/.test(text))throw Error('Tekst bevat niet-toegestane tekens of is te lang');
  return text;
};
function startDate(value){
  const v=safeText(value,10);
  if(!v)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Datum moet JJJJ-MM-DD zijn');
  const date=new Date(v+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v||date.getUTCFullYear()<2000||date.getUTCFullYear()>2100)
    throw Error('Ongeldige aanstellingsdatum');
  return v;
}
export function staffDossierEnabled(env){return env.BPD_ENABLE_STAFF_DOSSIERS==='true'}
export function staffDossierWritesEnabled(env){
  return staffDossierEnabled(env)&&env.BPD_ENABLE_STAFF_DOSSIER_WRITES==='true';
}
export function staffDossierId(dept,discordId){
  if(!validPersonnelKey(dept,discordId))throw Error('Ongeldige personeelsreferentie');
  return dept+'_'+discordId;
}
export function uniqueStaffSubject(records,dept,discordId){
  if(!validPersonnelKey(dept,discordId))return null;
  const matches=(Array.isArray(records)?records:[]).filter(p=>p.dept===dept&&p.personId===discordId);
  if(matches.length!==1)return null;
  return matches[0];
}
export function canReadStaffDossier(actor,staff){
  return Boolean(staff&&canReadServiceDossier(actor,staff.dept));
}
export function canMaintainStaffDossier(actor,staff){
  return Boolean(staff&&canEditGeneralPersonnelInfo(actor,staff));
}
export function normalizeStaffProfile(data){
  if(!data||typeof data!=='object')return {...DEFAULT};
  // Read existing data defensively, but never leak arbitrary Firestore fields.
  return {
    startDate:typeof data.startDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)?data.startDate:'',
    unit:typeof data.unit==='string'?data.unit.slice(0,80):'',
    functionTitle:typeof data.functionTitle==='string'?data.functionTitle.slice(0,80):''
  };
}
export function validateStaffProfile(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['profile','expectedRevision','reason'].includes(k)))
    throw Error('Ongeldige administratieve personeelswijziging');
  const fields=body.profile;
  if(!fields||typeof fields!=='object'||Array.isArray(fields)||
    Object.keys(fields).length!==FIELDS.length||
    Object.keys(fields).some(k=>!FIELDS.includes(k)))
    throw Error('Volledige administratieve basisgegevens vereist');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    throw Error('Ongeldige revisie');
  const reason=safeText(body.reason,500);
  if(reason.length<15)throw Error('Motivering vereist (minimaal 15 tekens)');
  const profile={
    startDate:startDate(fields.startDate),
    unit:safeText(fields.unit,80),
    functionTitle:safeText(fields.functionTitle,80)
  };
  return {profile,expectedRevision:body.expectedRevision,reason};
}
const asIso=value=>{
  const date=value?.toDate?.()||value;
  return date instanceof Date&&Number.isFinite(date.getTime())?date.toISOString():null;
};
export function publicStaffNote(data,id){
  if(!data||!STAFF_NOTE_TYPES.includes(data.kind))return null;
  return {id,kind:data.kind,title:String(data.title||'').slice(0,120),
    details:String(data.details||'').slice(0,1200),
    authorDiscordId:/^\d{15,22}$/.test(data.authorDiscordId||'')?data.authorDiscordId:null,
    recordedAt:asIso(data.createdAt)};
}
