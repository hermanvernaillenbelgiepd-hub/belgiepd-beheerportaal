// Read-only projection of recorded API shifts inside a CLOSED calendar month.
// No shift list guarantees history coverage; never use this for automatic pings.
// Date classification always uses Europe/Brussels, including DST transitions.
const DEPARTMENTS=new Set(['politie','brandweer','ambulance','depannage']);
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const brusselsMonth=date=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Europe/Brussels',year:'numeric',month:'2-digit'
}).format(date);
export function previousClosedDutyMonth(now=new Date()){
 const current=brusselsMonth(now),[y,m]=current.split('-').map(Number);
 return (m===1?y-1:y)+'-'+String(m===1?12:m-1).padStart(2,'0');
}
export function closedDutyMonth(value,now=new Date()){
 return typeof value==='string'&&MONTH.test(value)&&value<brusselsMonth(now);
}
const minute=x=>Number.isSafeInteger(x)&&x>=0&&x<=100000000?x:null;
function shiftMonth(iso){
 if(typeof iso!=='string'||!Number.isFinite(Date.parse(iso)))return null;
 return brusselsMonth(new Date(iso));
}
export function projectDutyMonthlyObservation(result,dept,month){
 if(!DEPARTMENTS.has(dept)||!MONTH.test(String(month||''))||
  result?.status!=='verified_api'||!Array.isArray(result.shifts))
  return {status:'unavailable',month};
 let count=0,minutes=0,excludedBoundary=0,excludedOngoing=0;
 const services=new Map();
 for(const shift of result.shifts){
  if(typeof shift.department!=='string'||
   shift.department.trim().toLowerCase()!==dept)continue;
  const start=shiftMonth(shift.startedAt),end=shiftMonth(shift.endedAt);
  if(shift.ongoing){
   if(start===month)excludedOngoing++;
   continue;
  }
  if(start===month&&end===month&&minute(shift.minutes)!==null){
   count++;minutes+=shift.minutes;
   const key=shift.service||'Niet opgegeven';
   services.set(key,(services.get(key)||0)+shift.minutes);
  }else if(start===month||end===month){
   // A shift crossing a month boundary cannot be apportioned without
   // authoritative minute-level data: do not invent its contribution.
   excludedBoundary++;
  }
 }
 if(!Number.isSafeInteger(minutes)||minutes>100000000)
  return {status:'unavailable',month};
 const hasRecords=count>0;
 return {
  status:hasRecords?'records_found':'not_confirmed',
  month,department:dept,source:'bpd-duty-times',
  recordedMinutes:hasRecords?minutes:null,
  completedShiftCount:count,excludedBoundary,excludedOngoing,
  byService:[...services].map(([service,minutes])=>({service,minutes})),
  // API period labels and global minutes are not evidence of historical coverage.
  fullMonthVerified:false,usableForAutomaticPings:false,
  definitiveMonthlyHours:null,
  retrievedAt:result.retrievedAt||null
 };
}
