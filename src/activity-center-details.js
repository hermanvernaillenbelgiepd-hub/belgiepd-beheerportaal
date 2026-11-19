// Read-only projection used by Activity Center. Verified tracker evidence is
// kept distinct from the old sheet, manual status decisions and official roster.
import {assessActivityPings} from './activity-ping-policy.js';
const ID=/^\d{15,22}$/;
const iso=value=>value?.toDate?.()?.toISOString?.()||
 (value instanceof Date?value.toISOString():typeof value==='string'?value:null);
const rounded=value=>Number.isFinite(value)?Math.round(value*10)/10:null;
function daysSince(isoDate,now){
 if(!isoDate||!Number.isFinite(Date.parse(isoDate)))return null;
 return Math.max(0,Math.floor((now.getTime()-Date.parse(isoDate))/86400000));
}
export function leaveInformation(leaves,today){
 const approved=(leaves||[]).filter(x=>x.status==='approved'&&
  /^\d{4}-\d{2}-\d{2}$/.test(x.startDate||'')&&
  /^\d{4}-\d{2}-\d{2}$/.test(x.endDate||''));
 const current=approved.filter(x=>x.startDate<=today&&x.endDate>=today)
  .sort((a,b)=>b.endDate.localeCompare(a.endDate))[0]||null;
 const upcoming=approved.filter(x=>x.startDate>today)
  .sort((a,b)=>a.startDate.localeCompare(b.startDate))[0]||null;
 const finished=approved.filter(x=>x.endDate<today)
  .sort((a,b)=>b.endDate.localeCompare(a.endDate))[0]||null;
 return {active:!!current,
  startDate:current?.startDate||null,endDate:current?.endDate||null,
  nextStart:upcoming?.startDate||null,nextEnd:upcoming?.endDate||null,
  lastEnded:finished?.endDate||null};
}
export function dossierPingSummary(rows){
 const valid=(rows||[]).filter(x=>x.type==='inactiviteitsping'&&
   !x.retired&&!x.retiredAt&&x.status!=='verwijderd')
  .sort((a,b)=>(iso(b.createdAt)||'').localeCompare(iso(a.createdAt)||''));
 // A portal alert from the automatic runner is NOT proof of a Discord DM.
 const actuallyPinged=valid.filter(x=>x.discordPingSent===true);
 const latest=valid[0]||null,last=actuallyPinged[0]||null;
 return {registered:valid.length,discordConfirmed:actuallyPinged.length,
  latestStatus:['ACTIEF','50/50','INACTIEF','VERWIJDERING_TE_BEOORDELEN','GEEN_VERBETERING_NA_PING','TUSSENTIJDSE_CONTROLE_PING','VERWIJDERD']
    .includes(latest?.activityStatus)?latest.activityStatus:null,
  latestAt:iso(latest?.createdAt)||null,
  lastDiscordAt:iso(last?.createdAt)||null,
  truncated:(rows||[]).length>=100};
}
export function enrichActivityRow(row,{verified=null,leaves=[],pings=null,returnCheck=null,
 today,now=new Date()}={}){
 const leave=leaveInformation(leaves,today);
 const enriched={...row,leave,verified:false,verifiedAt:null,
  periodLabel:'Sinds reset (oude bron)',pingDossier:pings,
  returnChecking:returnCheck?.status==='CHECKING',
  followupStatus:returnCheck?.status==='CHECKING'?'CHECKING':null,
  currentStatus:row.currentStatus};
 if(returnCheck?.status==='CHECKING'){
  enriched.kind='checking';enriched.reason='Verlof afgelopen op '+returnCheck.endDate+
   '. Bevoegd kader moet de terugkeer controleren.';
 }
 if(verified&&ID.test(String(row.discordId||''))&&
    verified.source==='signed-fivem-bot-and-discord-api'&&
    Number.isSafeInteger(verified.closedMonthPlaySeconds)&&
    Number.isFinite(Date.parse(verified.observedAt||''))){
  const age=now.getTime()-Date.parse(verified.observedAt);
  const fresh=age>=0&&age<=36*3600000;
  enriched.verified=fresh;enriched.verifiedAt=verified.observedAt;
  enriched.periodLabel='Afgesloten maand '+verified.closedMonth;
  enriched.periodPlayHours=rounded(verified.closedMonthPlaySeconds/3600);
  enriched.lastConnection=verified.lastConnectedAt?.slice(0,10)||null;
  enriched.daysInactive=daysSince(verified.lastConnectedAt,now);
  if(returnCheck?.status==='CHECKING')return enriched;
  if(leave.active){
   enriched.kind='verlof_nazien';enriched.reason='Goedgekeurd verlof tot '+leave.endDate+
    '; geen activiteitsmaatregel tijdens verlof';
  }else if(!fresh){
   enriched.kind='verouderd';enriched.reason='FiveM-meting ouder dan 36 uur: geen betrouwbare automatische beoordeling';
  }else{
   const proposed=assessActivityPings(verified,{joinedAt:verified.joinedAt,leaves},now);
   if(enriched.daysInactive>=60){
    enriched.kind='beoordelen';enriched.reason='60+ dagen geen connectie: manuele beslissing vereist, geen automatisch ontslag';
   }else if(proposed.length){
    enriched.kind=proposed[0].kind==='INACTIEF'?'inactief':'50/50';
    enriched.reason=proposed[0].reason;
   }else{enriched.kind='ok';enriched.reason='Geen drempel op basis van geverifieerde maandgegevens bereikt'}
  }
 }else if(leave.active){
  enriched.kind='verlof_nazien';enriched.reason='Goedgekeurd verlof tot '+leave.endDate+
   '; de oude trackerbron is geen voldoende bewijs voor een maatregel';
 }
 return enriched;
}
export function activityCenterStatistics(rows){
 const all=Array.isArray(rows)?rows:[];
 const group=members=>{
  const hours=members.filter(x=>x.verified===true&&Number.isFinite(x.periodPlayHours));
  return {total:members.length,active:members.filter(x=>
   /^(?:actief|active)$/i.test(String(x.currentStatus||''))&&!x.returnChecking).length,
   checking:members.filter(x=>x.returnChecking).length,
   half:members.filter(x=>x.kind==='50/50').length,
   inactive:members.filter(x=>x.kind==='inactief').length,
   removedReview:members.filter(x=>x.kind==='beoordelen').length,
   approvedLeave:members.filter(x=>x.leave?.active).length,
   verifiedTracker:hours.length,
   averageVerifiedHours:hours.length?
    rounded(hours.reduce((sum,p)=>sum+p.periodPlayHours,0)/hours.length):null,
   discordPingsConfirmed:members.reduce((s,p)=>s+(p.pingDossier?.discordConfirmed||0),0)};
 };
 const byDepartment={};
 for(const dept of ['politie','brandweer','ambulance','depannage']){
  byDepartment[dept]=group(all.filter(x=>x.department===dept));
 }
 return {overall:group(all),byDepartment};
}
