// Read-only recovery PROGRESS, not a personnel eligibility decision.
// A cumulative FiveM API response cannot prove a session history. Sampling
// two server-side API readings produces an indicative lower-bound increase,
// never a certified 5-hour return-to-ACTIEF entitlement.
export const RECOVERY_GOAL_MINUTES=300;
export const RECOVERY_WINDOW_DAYS=14;
export const RECOVERY_SAMPLES_COLLECTION='bpd_fivem_recovery_api_samples';
const DAY_MS=86400000;
const STATUS=new Set(['50/50','INACTIEF','CHECKING']);
const min=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000?value:null;
const ts=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?
 Date.parse(value):null;
export function recoveryStatus(status,checking=false){
 return checking?'CHECKING':String(status||'').trim().toUpperCase()==='INACTIEF'?'INACTIEF':
  String(status||'').trim().toUpperCase()==='50/50'?'50/50':
  String(status||'').trim().toUpperCase()==='CHECKING'?'CHECKING':null;
}
export function recoverySampleProjection(record,status,now=new Date()){
 const epoch=now.getTime(),cutoff=epoch-RECOVERY_WINDOW_DAYS*DAY_MS;
 const output={status:'unknown',trackingStatus:status,source:'bpd-server-player-cumulative',
  goalMinutes:RECOVERY_GOAL_MINUTES,windowDays:RECOVERY_WINDOW_DAYS,
  observedIncreaseMinutes:null,confirmedPlayMinutes:null,
  eligibleForActiveProposal:false,officialStatusChanged:false,
  sampleCount:0,startedAt:null,lastMeasuredAt:null,monthBoundaryResets:false,
  message:'Geen betrouwbare herstelmeting beschikbaar.'};
 if(!STATUS.has(status))return {...output,status:'not_applicable',
  message:'Geen herstelstatus; de officiële personeelsstatus blijft gelden.'};
 if(!record||record.trackingStatus!==status||!Array.isArray(record.samples))
  return {...output,status:'baseline_needed',
   message:'Start met een eerste FiveM-API-meting. Een cumulatief totaal is geen hersteluur.'};
 const sorted=record.samples.filter(x=>min(x?.totalPlayMinutes)!==null&&
    ts(x?.observedAt)!==null&&ts(x.observedAt)>=cutoff&&
    ts(x.observedAt)<=epoch+60000)
  .sort((a,b)=>ts(a.observedAt)-ts(b.observedAt)).slice(-100);
 if(!sorted.length)return {...output,status:'baseline_needed',
  message:'De eerste meting ligt buiten de 14 dagen. Begin een nieuwe herstelmeting.'};
 let increase=0,reset=false;
 for(let i=1;i<sorted.length;i++){
  const prev=sorted[i-1],curr=sorted[i];
  if(curr.totalPlayMinutes<prev.totalPlayMinutes){reset=true;continue}
  const diff=curr.totalPlayMinutes-prev.totalPlayMinutes;
  if(Number.isSafeInteger(diff))increase+=diff;
 }
 const last=sorted.at(-1),age=epoch-ts(last.observedAt);
 const stale=age>36*3600000;
 const count=sorted.length;
 return {...output,status:stale?'stale':count===1?'baseline_captured':
   increase>=RECOVERY_GOAL_MINUTES?'api_threshold_observed':'sampling',
  observedIncreaseMinutes:count>=2?increase:null,sampleCount:count,
  startedAt:sorted[0].observedAt,lastMeasuredAt:last.observedAt,
  counterResetObserved:reset,
  message:stale?'Laatste API-meting is verouderd; opnieuw controleren.':
   count===1?'Eerste meetpunt opgeslagen. Een volgende meting kan een verschil tonen.':
   reset?'API-teller daalde: het overlopende interval is bewust niet meegeteld.':
   increase>=RECOVERY_GOAL_MINUTES?
    '5 uur API-toename waargenomen. Nog geen zelfstandig geverifieerde FiveM-sessies; kader moet beoordelen.':
    'API-toename ter inzage; 5 uur is nog niet aangetoond met onafhankelijke sessies.'};
}
export function appendRecoveryApiSample(old,status,sample,now=new Date()){
 if(!STATUS.has(status)||min(sample?.totalPlayMinutes)===null||
  ts(sample.observedAt)===null||Math.abs(now.getTime()-ts(sample.observedAt))>120000)
  throw Error('Ongeldige herstelmeting');
 const previous=old?.trackingStatus===status&&Array.isArray(old.samples)?old.samples:[];
 const fresh=previous.filter(x=>ts(x?.observedAt)!==null&&
   ts(x.observedAt)>=now.getTime()-30*DAY_MS).slice(-99);
 const last=fresh.at(-1);
 if(last&&ts(sample.observedAt)-ts(last.observedAt)<5*60000)
  return {changed:false,trackingStatus:status,samples:fresh};
 return {changed:true,trackingStatus:status,samples:[...fresh,
   {observedAt:sample.observedAt,totalPlayMinutes:sample.totalPlayMinutes,
    lastConnectionAt:sample.lastConnectionAt||null}]};
}
