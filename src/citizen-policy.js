import {verifiedDiscordIdentity} from './user-access.js';

export const CITIZEN_COLLECTION='bpd_citizen_dossiers';
export const CITIZEN_ORIGINS=Object.freeze(['discord_oauth','trusted_fivem_server']);
const ID=/^\d{15,22}$/;
const MAX_NAME=80;

export function citizenDossiersEnabled(env){
  return env.BPD_ENABLE_CITIZEN_DOSSIERS==='true';
}
// An arbitrary username, Discord ID or guild member object is never sufficient
// to create a dossier: only a fresh verified portal token or trusted telemetry.
export function verifiedCitizenId(decoded,member,guildId,now=Date.now()){
  return verifiedDiscordIdentity(decoded,member,guildId,now,15*60*1000);
}
export function citizenKey(discordId){
  if(typeof discordId!=='string'||!ID.test(discordId))
    throw Error('Ongeldige Discord-identiteit');
  return discordId;
}
export function citizenInitialData(discordId,origin,username=''){
  citizenKey(discordId);
  if(!CITIZEN_ORIGINS.includes(origin))throw Error('Ongeldige dossierbron');
  const displayName=typeof username==='string'?username.trim().slice(0,MAX_NAME):'';
  return {discordId,origin,displayName,category:'burger',state:'registered'};
}
const iso=value=>{
  const d=value?.toDate?.()||value;
  if(d instanceof Date&&Number.isFinite(d.getTime()))return d.toISOString();
  return null;
};
export function publicCitizenProfile(doc,discordId){
  if(!doc||doc.discordId!==citizenKey(discordId)||
    doc.category!=='burger'||doc.state!=='registered'||
    !CITIZEN_ORIGINS.includes(doc.origin))return null;
  return {discordId,displayName:typeof doc.displayName==='string'?doc.displayName.slice(0,MAX_NAME):'',
    origin:doc.origin,registeredAt:iso(doc.createdAt),
    updatedAt:iso(doc.updatedAt)};
}
