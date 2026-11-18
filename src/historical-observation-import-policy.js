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
