import {validPersonnelKey,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
const SERVICES=Object.freeze(['politie','ambulance','brandweer','depannage']);
export function dossierScopes(actor){
  return {personnelDepartments:SERVICES.filter(dept=>canReadServiceDossier(actor,dept)),
    canReadSubject:person=>canReadPersonnelSubject(actor,person),applicationDepartments:[]};
}
export function dossierOverviewRows(personnel,_unused,scopes){
  const rows=new Map();
  for(const p of personnel||[]){
    if(!scopes.personnelDepartments.includes(p.dept)||
       !validPersonnelKey(p.dept,p.personId)||
       (typeof scopes.canReadSubject==='function'&&!scopes.canReadSubject(p)))continue;
    const key=p.dept+':'+p.personId;
    if(rows.has(key))throw Error('Dubbele personeelsidentiteit gevonden');
    rows.set(key,{dept:p.dept,discordId:p.personId,
      name:String(p.name||'').slice(0,120),call:String(p.call||'').slice(0,24),
      rank:String(p.rank||'').slice(0,80),status:String(p.status||'').slice(0,50),
      personnel:true,application:false,applicationStatus:null,
      source:p.source==='firestore-created'?'Firestore':'Google Sheets'});
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
  return result;
}
