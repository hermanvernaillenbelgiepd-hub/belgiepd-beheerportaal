// Verified FiveM activity only. This module produces proposed personal pings,
// never changes a personnel status and NEVER archives/dismisses a member.
import {createHash} from 'node:crypto';

const ID=/^\d{15,22}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const HOUR=3600;
const DAY=86400000;
const FRESH_MS=36*HOUR*1000;
const TZ='Europe/Brussels';

export const ACTIVITY_COLLECTION='bpd_verified_fivem_activity';
export const ACTIVITY_INGEST_EVENTS='bpd_verified_fivem_activity_events';
export const ACTIVITY_PING_TYPES=Object.freeze(['50/50','INACTIEF']);

const dayInBrussels=date=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'
}).format(date);
export const activityDateBrussels=(now=new Date())=>dayInBrussels(now);
export function previousCompleteMonth(now=new Date()){
 const current=dayInBrussels(now).slice(0,7);
 const [year,month]=current.split('-').map(Number);
 return new Date(Date.UTC(year,month-2,1,12)).toISOString().slice(0,7);
}
const isDate=x=>typeof x==='string'&&ISO.test(x)&&Number.isFinite(Date.parse(x));
const isMonth=x=>typeof x==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(x);

export function parseActivityTelemetry(payload,guild,now=Date.now()){
 const fields=['eventId','guildId','discordId','observedAt','source',
  'closedMonth','closedMonthPlaySeconds','lastConnectedAt'];
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
  Object.keys(payload).some(key=>!fields.includes(key))||
  fields.some(key=>!Object.hasOwn(payload,key)))throw Error('Ongeldige activiteitsgegevens');
 const {eventId,guildId,discordId,observedAt,source,closedMonth,
  closedMonthPlaySeconds,lastConnectedAt}=payload;
 if(!/^[a-zA-Z0-9_-]{12,64}$/.test(eventId||'')||!ID.test(discordId)||
  !ID.test(guildId)||guildId!==guild||source!=='fivem-activity'||
  !isDate(observedAt)||Math.abs(now-Date.parse(observedAt))>5*60*1000||
  !isMonth(closedMonth)||closedMonth!==previousCompleteMonth(new Date(now))||
  !Number.isSafeInteger(closedMonthPlaySeconds)||
  closedMonthPlaySeconds<0||closedMonthPlaySeconds>32*24*HOUR||
  lastConnectedAt!==null&&(!isDate(lastConnectedAt)||
   Date.parse(lastConnectedAt)>Date.parse(observedAt)+60000||
   Date.parse(lastConnectedAt)<Date.parse('2015-01-01T00:00:00Z')))
  throw Error('Onvolledige, verouderde of ongeldige FiveM-activiteit');
 return {eventId,guildId,discordId,observedAt,source,closedMonth,
  closedMonthPlaySeconds,lastConnectedAt};
}
const currentLeave=(leaves,today)=>leaves.some(l=>l.status==='approved'&&
 l.startDate<=today&&l.endDate>=today);
const overlapsMonth=(leaves,month)=>leaves.some(l=>l.status==='approved'&&
 l.startDate<=month+'-31'&&l.endDate>=month+'-01');
function absenceAnchor(lastConnectedAt,leaves,now){
 let anchor=Date.parse(lastConnectedAt);
 // A completed approved leave interrupts the absence clock. Mid-leave
 // reminders are always suppressed by currentLeave before this function.
 for(const leave of leaves){
  if(leave.status!=='approved'||!leave.endDate||!leave.startDate)continue;
  const end=Date.parse(leave.endDate+'T23:59:59Z');
  if(Number.isFinite(end)&&end>anchor&&end<=now)
   anchor=end;
 }
 return anchor;
}
const proposed=(kind,reason,criterion,incidentKey,evidence)=>({
 kind,reason,criterion,incidentKey,evidence
});
export function assessActivityPings(evidence,{joinedAt=null,leaves=[]}={},now=new Date()){
 const at=now.getTime(),sample=Date.parse(evidence?.observedAt||'');
 if(!Number.isFinite(at)||!Number.isFinite(sample)||
  sample>at+60000||at-sample>FRESH_MS)return [];
 const date=activityDateBrussels(now);
 if(currentLeave(leaves,date))return [];
 const candidates=[];
 const previousMonth=previousCompleteMonth(now);
 // A member needs a full, closed calendar month after joining Discord.
 if(evidence.closedMonth===previousMonth&&
   Number.isSafeInteger(evidence.closedMonthPlaySeconds)&&
   evidence.closedMonthPlaySeconds>=0&&
   isDate(joinedAt)&&joinedAt.slice(0,7)<previousMonth&&
   !overlapsMonth(leaves,previousMonth)){
  const hours=evidence.closedMonthPlaySeconds/HOUR;
  const kind=hours<10?'INACTIEF':hours<20?'50/50':null;
  if(kind)candidates.push(proposed(kind,
    'Afgesloten kalendermaand '+previousMonth+': '+hours.toFixed(2)+
    ' van 20 vereiste speeluren (ondergrens 10 uur).',
    'monthly',previousMonth+'_'+kind,{
      closedMonth:previousMonth,playSeconds:evidence.closedMonthPlaySeconds,
      observedAt:evidence.observedAt
    }));
 }
 if(isDate(evidence.lastConnectedAt)){
  const last=Date.parse(evidence.lastConnectedAt);
  if(last<=at){
   const anchor=absenceAnchor(evidence.lastConnectedAt,leaves,at);
   const days=(at-anchor)/DAY;
   const kind=days>=30?'INACTIEF':days>=14?'50/50':null;
   if(kind){
    const threshold=kind==='INACTIEF'?30:14;
    candidates.push(proposed(kind,
     'Geen bevestigde FiveM-verbinding gedurende minstens '+threshold+
     ' dagen. Laatste verbinding: '+evidence.lastConnectedAt+'.',
     'absence',evidence.lastConnectedAt+'_'+threshold,{
      lastConnectedAt:evidence.lastConnectedAt,days:Math.floor(days),
      observedAt:evidence.observedAt
     }));
   }
  }
 }
 // One notification per review round, with the strongest applicable rule.
 // Prefer absence when severity ties; do not send conflicting 50/50 and
 // INACTIEF pings at the same time. Idempotency is per rule and incident.
 return candidates.sort((a,b)=>
  (b.kind==='INACTIEF'?2:1)-(a.kind==='INACTIEF'?2:1)||
  (b.criterion==='absence'?1:0)-(a.criterion==='absence'?1:0)
 ).slice(0,1);
}
export function automaticPingEntryId(dept,id,ping){
 if(!/^(politie|brandweer|ambulance|depannage)$/.test(dept)||!ID.test(String(id))||
  !['50/50','INACTIEF'].includes(ping?.kind)||
  !['monthly','absence'].includes(ping?.criterion)||
  typeof ping?.incidentKey!=='string'||ping.incidentKey.length>90)
  throw Error('Ongeldige automatische pingreferentie');
 return createHash('sha256').update(
  ['bpd-activity-v1',dept,id,ping.criterion,ping.incidentKey].join('|')
 ).digest('hex').slice(0,24);
}
