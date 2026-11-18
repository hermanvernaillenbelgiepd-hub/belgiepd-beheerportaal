import {validPersonnelKey,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
const SERVICES=Object.freeze(['politie','ambulance','brandweer','depannage']);
export function dossierScopes(actor){
  return {personnelDepartments:SERVICES.filter(dept=>canReadServiceDossier(actor,dept)),
    canReadSubject:person=>canReadPersonnelSubject(actor,person),applicationDepartments:[]};
}
export function dossierOverviewRows(personnel,_unused,scopes){
  const rows=new Map();
  for(const [index,p] of (personnel||[]).entries()){
    if(!scopes.personnelDepartments.includes(p.dept))continue;
    const linked=validPersonnelKey(p.dept,p.personId);
    const key=linked?p.dept+':'+p.personId:p.dept+':unlinked:'+index;
    if(rows.has(key))throw Error('Dubbele personeelsidentiteit gevonden');
    rows.set(key,{dept:p.dept,discordId:linked?p.personId:null,
      name:String(p.name||'').slice(0,120),call:String(p.call||'').slice(0,24),
      series:p.dept==='politie'?String(p.series||'').slice(0,32):null,
      rank:String(p.rank||'').slice(0,80),status:String(p.status||'').slice(0,50),
      canOpen:linked&&typeof scopes.canReadSubject==='function'&&scopes.canReadSubject(p),
      personnel:true,application:false,applicationStatus:null,
      source:p.source==='firestore-created'?'Firestore':'Google Sheets'});
  }
  return [...rows.values()].sort((a,b)=>a.dept.localeCompare(b.dept,'nl')||
    a.name.localeCompare(b.name,'nl')||String(a.discordId||'').localeCompare(String(b.discordId||'')));
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
