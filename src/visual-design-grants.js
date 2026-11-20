// Isolated design-only permission. Never amend portal roles, Discord roles,
// technical access or any personnel/dossier permissions.
import {mayEditTechnicalSettings} from './technical-center-config.js';
export const DESIGN_GRANTS_COLLECTION='bpd_portal_visual_design_grants';
export const DESIGN_GRANTS_AUDIT='bpd_portal_visual_design_grant_audit';
const ID=/^\d{15,22}$/;
export function mayDelegateVisualDesign(actor){
 return mayEditTechnicalSettings(actor);
}
export function belgianToday(now=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',
  month:'2-digit',day:'2-digit'}).format(now);
}
export function isActiveVisualDesignGrant(actor,raw,today=belgianToday()){
 const id=String(actor?.discordId||'');
 return Boolean(ID.test(id)&&actor?.uid==='discord:'+id&&
  raw?.discordId===id&&raw?.enabled===true&&
  (!raw.expiresOn||(typeof raw.expiresOn==='string'&&raw.expiresOn>=today)));
}
export function validateVisualDesignGrantWrite(discordId,raw,now=new Date()){
 if(!ID.test(String(discordId||'')))throw Object.assign(Error('Discord-ID ongeldig'),{status:400});
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).some(k=>!['action','reason','expiresOn','expectedRevision'].includes(k))||
  !['action','reason','expectedRevision'].every(k=>Object.hasOwn(raw,k)))
  throw Object.assign(Error('Ongeldige machtigingsaanvraag'),{status:400});
 if(!['grant','revoke'].includes(raw.action))
  throw Object.assign(Error('Kies toegang geven of intrekken'),{status:400});
 if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)
  throw Object.assign(Error('De rechtenlijst is verouderd: herlaad eerst'),{status:400});
 const reason=typeof raw.reason==='string'?raw.reason.trim():'';
 if(reason.length<10||reason.length>240||/[\x00-\x1f\x7f<>]/.test(reason))
  throw Object.assign(Error('Geef een motivering van 10 tot 240 tekens'),{status:400});
 let expiresOn=raw.expiresOn??null;
 if(expiresOn==='')expiresOn=null;
 if(raw.action==='revoke'&&expiresOn!==null)
  throw Object.assign(Error('Een intrekking heeft geen vervaldatum'),{status:400});
 if(expiresOn!==null){
  if(typeof expiresOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)||
   Number.isNaN(Date.parse(expiresOn+'T12:00:00Z'))||
   new Date(expiresOn+'T12:00:00Z').toISOString().slice(0,10)!==expiresOn||
   expiresOn<belgianToday(now))
   throw Object.assign(Error('Ongeldige of verlopen einddatum'),{status:400});
 }
 return {discordId,action:raw.action,reason,expiresOn,expectedRevision:raw.expectedRevision};
}
