import {BURGER_ROLE_IDS} from './burger-organogram-projection.js';
import {calendarDays} from './leave-policy.js';

export const CITIZEN_DOSSIER_COLLECTION='bpd_burger_dossiers';
export const CITIZEN_ENTRY_TYPES=Object.freeze(['notitie','observatie','sanctie','volwaardig']);
const ID=/^\d{15,22}$/;
const TEXT_CONTROL=/[\x00-\x1f\x7f<>]/;
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
const validSnapshot=(member,guildId,maxAge,now=Date.now())=>
  ID.test(String(guildId||''))&&member?.guildId===guildId&&
  Number.isSafeInteger(member.verifiedAt)&&member.verifiedAt<=now+60000&&
  now-member.verifiedAt<=maxAge&&
  Array.isArray(member.roleIds)&&member.roleIds.length<=500&&
  member.roleIds.every(id=>ID.test(id));

export function isVerifiedCitizenCouncil(decoded,member,guildId,now=Date.now()){
  return Boolean(decoded?.firebase?.sign_in_provider==='custom'&&
    decoded.bpdDiscord===true&&decoded.bpdGuildId===guildId&&
    ID.test(String(decoded.uid||'').replace(/^discord:/,''))&&
    decoded.uid==='discord:'+String(decoded.uid).slice(8)&&
    validSnapshot(member,guildId,15*60*1000,now)&&
    member.roleIds.includes(BURGER_ROLE_IDS.council));
}
export function citizenStage(roleIds){
  const roles=new Set(Array.isArray(roleIds)?roleIds:[]);
  if(roles.has(BURGER_ROLE_IDS.member))return 'Burger';
  if(roles.has(BURGER_ROLE_IDS.trainee))return 'BIO';
  if(roles.has(BURGER_ROLE_IDS.council))return 'Burgerraad';
  return null;
}
export function verifiedCitizenStage(personId,upstream,member,guildId,now=Date.now()){
  if(!ID.test(String(personId||'')))return null;
  if(upstream?.status==='ok'&&upstream.entries instanceof Map){
    // An authoritative, successful current guild snapshot takes precedence
    // over an older OAuth cache, including on role revocation.
    return citizenStage(upstream.entries.get(personId));
  }
  return validSnapshot(member,guildId,7*86400000,now)?
    citizenStage(member.roleIds):null;
}
function stringField(value,max,min=0){
  if(typeof value!=='string'||value.trim().length<min||
     value.trim().length>max||TEXT_CONTROL.test(value))throw Error('Ongeldige tekst of lengte');
  return value.trim();
}
function validDate(value){
  if(typeof value!=='string'||!isoDay.test(value))throw Error('Ongeldige datum');
  calendarDays(value,value);
  return value;
}
export function validateCitizenEntry(body,stage){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['type','title','details','date','sanctionType','score'].includes(key)))
    throw Error('Ongeldige dossierregistratie');
  if(!CITIZEN_ENTRY_TYPES.includes(body.type))throw Error('Kies een dossieronderdeel');
  const type=body.type;
  const eventDate=validDate(body.date);
  if(type==='volwaardig'&&stage!=='Burger')
    throw Error('De huidige, geverifieerde Burger-rol ontbreekt');
  const title=type==='volwaardig'?'Overgang naar volwaardige Burger':
    stringField(body.title,120,3);
  const details=stringField(body.details||'',2000,type==='volwaardig'?5:10);
  let sanctionType=null,score=null;
  if(type==='sanctie'){
    if(!['mondeling','schriftelijk'].includes(body.sanctionType))
      throw Error('Sanctie moet mondeling of schriftelijk zijn');
    sanctionType=body.sanctionType;
  }else if(body.sanctionType!==undefined&&body.sanctionType!==null&&body.sanctionType!==''){
    throw Error('Sanctietype uitsluitend bij sancties');
  }
  if(type==='observatie'){
    if(body.score!==undefined&&body.score!==null&&body.score!==''){
      if(!Number.isInteger(body.score)||body.score<0||body.score>10)
        throw Error('Observatiescore moet tussen 0 en 10 liggen');
      score=body.score;
    }
  }else if(body.score!==undefined&&body.score!==null&&body.score!==''){
    throw Error('Observatiescore uitsluitend bij observaties');
  }
  return {type,title,details,eventDate,sanctionType,score};
}
export function validateCitizenLeave(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(key=>!['startDate','endDate','note'].includes(key)))
    throw Error('Ongeldige verlofregistratie');
  const startDate=validDate(body.startDate),endDate=validDate(body.endDate);
  const days=calendarDays(startDate,endDate);
  const note=stringField(body.note||'',300);
  return {startDate,endDate,days,note};
}
export function citizenReport(entries,leaves){
  const list=Array.isArray(entries)?entries:[];
  const counts=Object.fromEntries([...CITIZEN_ENTRY_TYPES,'verlof'].map(type=>
    [type,type==='verlof'?(leaves||[]).length:list.filter(entry=>entry.type===type).length]));
  const scores=list.filter(e=>e.type==='observatie'&&Number.isInteger(e.score)&&
    e.score>=0&&e.score<=10).map(e=>e.score);
  return {counts,observationAverage:scores.length?
    Math.round(scores.reduce((sum,n)=>sum+n,0)/scores.length*10)/10:null,
    scoredObservations:scores.length};
}
