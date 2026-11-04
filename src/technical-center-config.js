// BelgiumPD Technical Centre v1: small, explicit, server-authorized settings.
// Changing these settings never grants Discord, personnel or dossier rights.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleForDepartment} from './leave-policy.js';

export const TECHNICAL_SETTINGS_COLLECTION='bpd_portal_technical_settings';
export const TECHNICAL_SETTINGS_AUDIT='bpd_portal_technical_settings_audit';
export const TECHNICAL_SETTINGS_DOC='automation';
export const DEFAULT_TECHNICAL_SETTINGS=Object.freeze({
 observationArchiveEnabled:true,
 observationArchiveDays:30
});
const ID=/^\d{15,22}$/;
const keys=['expectedRevision','observationArchiveEnabled',
 'observationArchiveDays','reason'];

export function mayEditTechnicalSettings(actor){
 return Boolean(actor&&ID.test(String(actor.discordId||''))&&
  actor.uid==='discord:'+actor.discordId&&
  actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true&&
  actor.role==='beheerder');
}
export function mayOpenTechnicalCenter(actor){
 if(mayEditTechnicalSettings(actor))return true;
 // Only personally authenticated, approved Police Officers/Corps may open
 // central management. A global role from Brandweer, AZLS or Bestuur cannot
 // substitute for an independent Police department grant.
 return Boolean(actor&&ID.test(String(actor.discordId||''))&&
   actor.uid==='discord:'+actor.discordId&&
   actor.portalTechnicalMode!==true&&
   actor.departments?.includes('politie')===true&&
   ['officierenkader','korpsleiding'].includes(
     roleForDepartment(actor,'politie')));
}
export function technicalSettingsFrom(value){
 const enabled=typeof value?.observationArchiveEnabled==='boolean'?
  value.observationArchiveEnabled:DEFAULT_TECHNICAL_SETTINGS.observationArchiveEnabled;
 const days=Number.isSafeInteger(value?.observationArchiveDays)&&
  value.observationArchiveDays>=7&&value.observationArchiveDays<=365?
   value.observationArchiveDays:DEFAULT_TECHNICAL_SETTINGS.observationArchiveDays;
 return {observationArchiveEnabled:enabled,observationArchiveDays:days,
  revision:Number.isSafeInteger(value?.revision)&&value.revision>=0?
   value.revision:0};
}
export function validateTechnicalSettings(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!keys.includes(k))||
  keys.some(k=>!Object.hasOwn(input,k)))
  throw Object.assign(Error('Vul uitsluitend de vier toegelaten instellingsvelden in'),{status:400});
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)
  throw Object.assign(Error('Vernieuw de instellingen voordat je ze bewaart'),{status:400});
 if(typeof input.observationArchiveEnabled!=='boolean')
  throw Object.assign(Error('Automatisch archiveren moet aan of uit staan'),{status:400});
 if(!Number.isSafeInteger(input.observationArchiveDays)||
  input.observationArchiveDays<7||input.observationArchiveDays>365)
  throw Object.assign(Error('Kies een bewaartermijn tussen 7 en 365 dagen'),{status:400});
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length<8||reason.length>240||/[\x00-\x1f\x7f<>]/.test(reason))
  throw Object.assign(Error('Geef een motivering van 8 tot 240 tekens'),{status:400});
 return {observationArchiveEnabled:input.observationArchiveEnabled,
  observationArchiveDays:input.observationArchiveDays,
  expectedRevision:input.expectedRevision,reason};
}
export async function loadTechnicalSettings(db=getFirestore()){
 const snap=await db.collection(TECHNICAL_SETTINGS_COLLECTION)
  .doc(TECHNICAL_SETTINGS_DOC).get();
 return technicalSettingsFrom(snap.data());
}
export async function writeTechnicalSettings(db,actor,body){
 if(!mayEditTechnicalSettings(actor))
  throw Object.assign(Error('Alleen het geverifieerde technische profiel kan instellingen wijzigen'),{status:403});
 const input=validateTechnicalSettings(body);
 const ref=db.collection(TECHNICAL_SETTINGS_COLLECTION).doc(TECHNICAL_SETTINGS_DOC);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  const previous=technicalSettingsFrom(snap.data());
  if(previous.revision!==input.expectedRevision)
   throw Object.assign(Error('De instellingen zijn intussen gewijzigd. Vernieuw en probeer opnieuw.'),{status:409});
  if(previous.observationArchiveDays===input.observationArchiveDays&&
     previous.observationArchiveEnabled===input.observationArchiveEnabled)
   return {changed:false,config:previous};
  const next={observationArchiveDays:input.observationArchiveDays,
   observationArchiveEnabled:input.observationArchiveEnabled,
   revision:previous.revision+1};
  const at=FieldValue.serverTimestamp();
  tx.set(ref,{...next,updatedAt:at,updatedBy:actor.discordId});
  tx.create(db.collection(TECHNICAL_SETTINGS_AUDIT).doc(),{
   scope:'automation',actorUid:actor.uid,reason:input.reason,
   before:previous,after:next,at
  });
  return {changed:true,config:next};
 });
}
const serialAudit=doc=>{
 const data=doc.data();
 return {id:doc.id,reason:data.reason||'',actorUid:data.actorUid||'',
  before:technicalSettingsFrom(data.before),after:technicalSettingsFrom(data.after),
  at:data.at?.toDate?.().toISOString()||null};
};
export function installTechnicalCenterRoutes(app,{requireUser,dbFactory=getFirestore}){
 app.get('/api/technical-center/context',requireUser,async(req,res)=>{
  if(!mayOpenTechnicalCenter(req.bpd))
   return res.status(403).json({error:'Beheercentrum uitsluitend voor Politie Officierenkader, Korpsleiding en geverifieerd Technisch Beheer'});
  try{
   const db=dbFactory(),canEdit=mayEditTechnicalSettings(req.bpd);
   const [config,history]=await Promise.all([
    loadTechnicalSettings(db),
    canEdit?db.collection(TECHNICAL_SETTINGS_AUDIT)
     .orderBy('at','desc').limit(12).get():Promise.resolve(null)
   ]);
   res.set('Cache-Control','private, no-store');
   res.json({canEdit,config,history:history?.docs.map(serialAudit)||[],
    emergencyDisabled:process.env.BPD_DISABLE_BASIC_OBSERVATION_AUTO_ARCHIVE==='true',
    scheduler:'hourly',configurationVersion:1});
  }catch(e){
   console.error('Technisch Beheercentrum laden:',e?.code||'databasefout');
   res.status(503).json({error:'Technische instellingen tijdelijk niet beschikbaar'});
  }
 });
 app.put('/api/technical-center/config',requireUser,async(req,res)=>{
  if(!mayEditTechnicalSettings(req.bpd))
   return res.status(403).json({error:'Schakel jouw geverifieerde Technisch Beheer-profiel in'});
  try{
   const result=await writeTechnicalSettings(dbFactory(),req.bpd,req.body);
   res.set('Cache-Control','private, no-store');
   res.json({saved:true,...result});
  }catch(e){
   if(e.status)return res.status(e.status).json({error:e.message});
   console.error('Technische instellingen bewaren:',e?.code||'databasefout');
   res.status(503).json({error:'Instellingen niet opgeslagen; vorige versie blijft geldig'});
  }
 });
}
