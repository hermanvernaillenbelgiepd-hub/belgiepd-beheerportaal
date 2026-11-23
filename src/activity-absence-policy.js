// Exact calendar-day accounting for inactivity. Read-only and deterministic.
const DAY=86400000;
const dayNumber=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const ms=Date.parse(value+'T12:00:00Z');
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?Math.round(ms/DAY):null;
};
export function activityBrusselsDay(timestamp){
 if(typeof timestamp!=='string')return null;
 if(dayNumber(timestamp)!==null)return timestamp;
 const time=Date.parse(timestamp);
 if(!Number.isFinite(time))return null;
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
}
export function absenceBreakdown(lastConnection,approvedPeriods,today){
 const from=dayNumber(activityBrusselsDay(lastConnection)),to=dayNumber(today);
 const unavailable={calendarDays:null,excludedLeaveDays:null,effectiveDays:null};
 if(from===null||to===null||to<from||to-from>3650)return unavailable;
 const calendarDays=to-from;
 const intervals=[];
 for(const leave of Array.isArray(approvedPeriods)?approvedPeriods:[]){
  if(leave?.status!=='approved')continue;
  const begin=dayNumber(leave.startDate),end=dayNumber(leave.endDate);
  if(begin===null||end===null||begin>end)continue;
  // Days after the last connection, through the current Belgian date.
  const a=Math.max(begin,from+1),b=Math.min(end,to);
  if(b>=a)intervals.push([a,b]);
 }
 intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const merged=[];
 for(const [a,b] of intervals){
  if(merged.length&&a<=merged.at(-1)[1]+1)
   merged.at(-1)[1]=Math.max(merged.at(-1)[1],b);
  else merged.push([a,b]);
 }
 const excludedLeaveDays=merged.reduce((n,[a,b])=>n+b-a+1,0);
 return {calendarDays,excludedLeaveDays,
  effectiveDays:Math.max(0,calendarDays-excludedLeaveDays)};
}
export function absenceStage(effectiveDays){
 if(!Number.isSafeInteger(effectiveDays)||effectiveDays<0)return 'unknown';
 if(effectiveDays>=60)return 'review-60';
 if(effectiveDays>=30)return 'approaching-60';
 if(effectiveDays>=15)return 'approaching-30';
 if(effectiveDays>=10)return 'approaching-15';
 return 'normal';
}
