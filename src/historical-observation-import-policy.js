import {roleForDepartment} from './leave-policy.js';

export const HISTORICAL_OBSERVATION_SETTINGS='bpd_historical_observation_settings';
export const HISTORICAL_OBSERVATION_SETTINGS_AUDIT='bpd_historical_observation_settings_audit';
export const HISTORICAL_OBSERVATION_DOC='politie';
const ID=/^\d{15,22}$/;
export function canManageHistoricalObservationImport(actor){
 return Boolean(actor&&ID.test(String(actor.discordId||''))&&
  actor.uid==='discord:'+actor.discordId&&
  (actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true||
   actor.departments?.includes('politie')&&
   ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'))&&
   (actor.dossierNativeDepartments?.includes('politie')||
    actor.dossierFullDepartments?.includes('politie'))));
}
export function historicalObservationSettings(data){
 return {enabled:typeof data?.enabled==='boolean'?data.enabled:true,
  revision:Number.isSafeInteger(data?.revision)&&data.revision>=0?data.revision:0};
}
export function validateHistoricalObservationToggle(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).some(x=>!['enabled','expectedRevision','reason'].includes(x)))
  throw Error('Ongeldige instellingen');
 if(typeof data.enabled!=='boolean'||!Number.isSafeInteger(data.expectedRevision)||
    data.expectedRevision<0)throw Error('Vernieuw de instellingen voor je ze wijzigt');
 const reason=String(data.reason??'').trim();
 if(reason.length<10||reason.length>300||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering van 10 tot 300 tekens vereist');
 return {enabled:data.enabled,expectedRevision:data.expectedRevision,reason};
}
export const historicalObservationAllowed=(actor,dept,type,config)=>
 dept==='politie'&&type==='observatie'&&config?.enabled===true;


// Onafhankelijk van de bestaande observatie-overname: uitgebreide migratie
// start UIT en kan enkel tijdelijk door Officierenkader/Korpsleiding geactiveerd
// worden. Zo opent een bestaande observatie-instelling niet stilzwijgend het
// overnemen van sancties, notities, verloven of pings.
export function historicalMigrationSettings(data){
 return {enabled:data?.extendedEnabled===true,
  revision:Number.isSafeInteger(data?.extendedRevision)&&data.extendedRevision>=0?
    data.extendedRevision:0};
}
export function validateHistoricalMigrationToggle(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
   Object.keys(data).some(key=>!['enabled','expectedRevision','reason'].includes(key)))
   throw Error('Ongeldige migratie-instelling');
 if(typeof data.enabled!=='boolean'||!Number.isSafeInteger(data.expectedRevision)||
    data.expectedRevision<0)throw Error('Vernieuw eerst de migratie-instelling');
 const reason=String(data.reason??'').trim();
 if(reason.length<10||reason.length>300||/[<>\x00-\x1f\x7f]/.test(reason))
   throw Error('Motivering van 10 tot 300 tekens vereist');
 return {enabled:data.enabled,expectedRevision:data.expectedRevision,reason};
}
export function historicalMigrationAllowed(actor,dept,type,config){
 return dept==='politie'&&
  ['sanctie','notitie','inactiviteitsping','verlof'].includes(type)&&
  config?.enabled===true&&canManageHistoricalObservationImport(actor);
}
export function validateHistoricalActorSelection(actorId,reason,loggedInDiscordId){
 if(typeof actorId!=='string'||!ID.test(actorId)||actorId===loggedInDiscordId)
  throw Error('Kies een andere, oorspronkelijke registrator');
 if(typeof reason!=='string'||reason.trim().length<10||reason.trim().length>500)
  throw Error('Vermeld de bron en reden van historische overname (10–500 tekens)');
 return {actorId,reason:reason.trim()};
}
