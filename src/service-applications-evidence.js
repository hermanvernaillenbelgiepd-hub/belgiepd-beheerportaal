import {createHmac,timingSafeEqual} from 'node:crypto';
import {assessServiceApplicant} from './service-applications-policy.js';

export const EVIDENCE_COLLECTION='bpd_fivem_verified_playtime';
const ID=/^\d{15,22}$/;
export function hasTelemetryKey(secret){return typeof secret==='string'&&secret.length>=32&&!/^PLACEHOLDER/i.test(secret)}
const payload=(discordId,e)=>JSON.stringify([
  discordId,e.source,e.totalPlaySeconds,e.firstServerJoinAt,e.verifiedAt
]);
function mac(secret,discordId,e){
  return createHmac('sha256',secret).update(payload(discordId,e)).digest('hex');
}
export function safeCompare(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
export function validatedTelemetryInput(x,now=Date.now()){
  if(!x||typeof x!=='object'||Array.isArray(x)||
      Object.keys(x).some(k=>!['discordId','totalPlaySeconds','firstServerJoinAt'].includes(k)))
    throw Error('Ongeldige FiveM-telemetrie');
  if(!ID.test(x.discordId)||!Number.isSafeInteger(x.totalPlaySeconds)||
      x.totalPlaySeconds<0||x.totalPlaySeconds>1000000000)
    throw Error('Ongeldige speleridentiteit of speeluren');
  const t=Date.parse(x.firstServerJoinAt);
  if(typeof x.firstServerJoinAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(x.firstServerJoinAt)||
     !Number.isFinite(t)||t>now||t<now-15*365.25*86400000)
    throw Error('Ongeldige datum eerste FiveM-verbinding');
  return {discordId:x.discordId,totalPlaySeconds:x.totalPlaySeconds,
    firstServerJoinAt:new Date(t).toISOString()};
}
export function signTrustedTelemetry(discordId,values,secret,now=Date.now()){
  if(!hasTelemetryKey(secret)||!ID.test(discordId))throw Error('Telemetrie-sleutel ontbreekt');
  const e={source:'trusted_fivem_server',totalPlaySeconds:values.totalPlaySeconds,
    firstServerJoinAt:values.firstServerJoinAt,verifiedAt:new Date(now).toISOString()};
  return {...e,signature:mac(secret,discordId,e)};
}
export function verifySignedTelemetry(discordId,data,secret,now=Date.now()){
  if(!hasTelemetryKey(secret)||!ID.test(discordId)||!data||
      typeof data.signature!=='string'||!/^[0-9a-f]{64}$/.test(data.signature)||
      !safeCompare(data.signature,mac(secret,discordId,data)))return assessServiceApplicant(null,now);
  return assessServiceApplicant(data,now);
}
