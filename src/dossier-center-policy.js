import {canViewPersonnel,validPersonnelKey} from './personnel-editor-policy.js';
import {canCreatePersonnel} from './personnel-create.js';
import {APPLICATION_SERVICES} from './service-applications-policy.js';

const SERVICES=Object.freeze(['politie','ambulance','brandweer','depannage']);
const STATUSES=new Set(['submitted','reviewing','accepted','rejected']);

// Existing permission rules are reused, never inferred from a Discord role name.
export function dossierScopes(actor,applicationsEnabled=false){
  const personnelDepartments=SERVICES.filter(dept=>canViewPersonnel(actor,dept));
  const applicationDepartments=applicationsEnabled
    ?APPLICATION_SERVICES.filter(dept=>canCreatePersonnel(actor,dept)):[];
  return {personnelDepartments,applicationDepartments};
}
export function dossierOverviewRows(personnel,applications,scopes){
  const rows=new Map();
  for(const p of personnel||[]){
    if(!scopes.personnelDepartments.includes(p.dept)||
       !validPersonnelKey(p.dept,p.personId))continue;
    const key=p.dept+':'+p.personId;
    // Duplicated source identities must be resolved before displaying a dossier.
    if(rows.has(key))throw Error('Dubbele personeelsidentiteit gevonden');
    rows.set(key,{dept:p.dept,discordId:p.personId,
      name:String(p.name||'').slice(0,120),call:String(p.call||'').slice(0,24),
      rank:String(p.rank||'').slice(0,80),status:String(p.status||'').slice(0,50),
      personnel:true,application:false,applicationStatus:null,
      source:p.source==='firestore-created'?'Firestore':'Google Sheets'});
  }
  for(const a of applications||[]){
    if(!scopes.applicationDepartments.includes(a.dept)||
       !validPersonnelKey(a.dept,a.discordId)||!STATUSES.has(a.status))continue;
    const key=a.dept+':'+a.discordId;
    const original=rows.get(key);
    if(original){
      // Same ID is a lookup aid, NOT automatic proof of identity or access.
      if(original.application)throw Error('Dubbele sollicitatie gevonden');
      rows.set(key,{...original,application:true,applicationStatus:a.status});
    }else rows.set(key,{dept:a.dept,discordId:a.discordId,
      name:String(a.username||'Discord-kandidaat').slice(0,80),
      call:null,rank:null,status:null,personnel:false,
      application:true,applicationStatus:a.status,source:'Sollicitatie'});
  }
  return [...rows.values()].sort((a,b)=>a.dept.localeCompare(b.dept,'nl')||
    a.name.localeCompare(b.name,'nl')||a.discordId.localeCompare(b.discordId));
}

export function dossierTimelineEntry(event,kind){
  const date=event?.at?.toDate?.()||event?.at;
  let at=null;
  if(date instanceof Date&&Number.isFinite(date.getTime()))at=date.toISOString();
  else if(typeof date==='string'&&Number.isFinite(Date.parse(date)))at=new Date(date).toISOString();
  const result={kind,action:String(event?.action||'registratie').slice(0,55),
    at,previousRank:typeof event?.previousRank==='string'?event.previousRank.slice(0,80):null,
    newRank:typeof event?.newRank==='string'?event.newRank.slice(0,80):null,
    reason:typeof event?.reason==='string'?event.reason.slice(0,500):'',
    actorDiscordId:/^\d{15,22}$/.test(event?.actorDiscordId||event?.byDiscordId||'')
      ?event.actorDiscordId||event.byDiscordId:null};
  // Preserve application workflow steps without revealing additional audit
  // metadata such as arbitrary document contents, tokens or internal grants.
  if(STATUSES.has(event?.previousStatus))result.previousStatus=event.previousStatus;
  if(STATUSES.has(event?.newStatus))result.newStatus=event.newStatus;
  return result;
}
