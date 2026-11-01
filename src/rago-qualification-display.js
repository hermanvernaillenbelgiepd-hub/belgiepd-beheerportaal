// Pure, read-only display projection for the three verified RAGO Discord roles.
// This NEVER grants a role, qualification, dossier permission or writes Firestore.
// A verified full RAGO role supersedes RAGO-IO even when Discord still retains IO.
import {verifiedSyncRoles,RAGO_IO_DISCORD_ROLE} from './organogram-placement-policy.js';

export const RAGO_FULL_DISCORD_ROLE='1309532437977497700';
export const RAGO_INSTRUCTOR_DISCORD_ROLE='1393050551188721865';
export const RAGO_DISPLAY_ROLE_IDS=Object.freeze([
 RAGO_IO_DISCORD_ROLE,RAGO_FULL_DISCORD_ROLE,RAGO_INSTRUCTOR_DISCORD_ROLE
]);

export function verifiedRagoQualification(identity,guildId,now=Date.now()){
 const verified=verifiedSyncRoles(identity,'politie',guildId,now);
 if(!verified.synced)return null;
 const roleIds=new Set(identity.roleIds);
 if(roleIds.has(RAGO_INSTRUCTOR_DISCORD_ROLE))
  return {label:'RAGO',value:'INSTRUCTEUR',level:'Instructeur',
   roleId:RAGO_INSTRUCTOR_DISCORD_ROLE,source:'discord-verified'};
 if(roleIds.has(RAGO_FULL_DISCORD_ROLE))
  return {label:'RAGO',value:'Ja',level:'Volwaardig',
   roleId:RAGO_FULL_DISCORD_ROLE,source:'discord-verified'};
 if(roleIds.has(RAGO_IO_DISCORD_ROLE))
  return {label:'RAGO',value:'AANGEMELD',level:'RAGO-IO · in opleiding',
   roleId:RAGO_IO_DISCORD_ROLE,source:'discord-verified'};
 return null;
}

export function overlayVerifiedRagoItems(items,qualification){
 if(!Array.isArray(items)||!qualification)return items;
 const found=items.findIndex(item=>item?.label==='RAGO');
 if(found<0)return [...items,{...qualification}];
 const existing=items[found];
 // A specifically recorded management decision always wins.
 if(existing.source==='manual')return items;
 const result=[...items];result[found]={...existing,...qualification};
 return result;
}

export function overlayVerifiedRagoRoster(records,documents,guildId,now=Date.now()){
 if(!Array.isArray(records)||!Array.isArray(documents))return records;
 const verified=new Map();
 for(const doc of documents){
  const identity=typeof doc?.data==='function'?doc.data():doc;
  const id=typeof doc?.id==='string'?doc.id:identity?.discordId;
  if(!/^\d{15,22}$/.test(String(id||'')))continue;
  const qualification=verifiedRagoQualification(identity,guildId,now);
  if(qualification)verified.set(id,qualification);
 }
 if(!verified.size)return records;
 return records.map(person=>{
  if(person?.dept!=='politie'||!verified.has(person.personId))return person;
  const specialties=overlayVerifiedRagoItems(person.specialties,
    verified.get(person.personId));
  return specialties===person.specialties?person:{...person,specialties};
 });
}

// When showing the verified role badges, keep one RAGO level and one patch.
// A retained IO role must not produce a second, obsolete badge.
export function suppressSupersededRagoMatches(matches){
 if(!Array.isArray(matches))return [];
 const rago=matches.filter(x=>x.label==='RAGO');
 if(rago.length<2)return matches;
 const ranks={
  [RAGO_IO_DISCORD_ROLE]:1,
  [RAGO_FULL_DISCORD_ROLE]:2,
  [RAGO_INSTRUCTOR_DISCORD_ROLE]:3
 };
 const top=rago.slice().sort((a,b)=>
  (ranks[b.roleId]||0)-(ranks[a.roleId]||0))[0];
 return matches.filter(x=>x.label!=='RAGO'||x===top)
  .map(x=>x===top&&x.roleId===RAGO_IO_DISCORD_ROLE?
   {...x,value:'AANGEMELD'}:x);
}
