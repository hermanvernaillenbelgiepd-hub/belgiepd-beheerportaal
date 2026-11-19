// Presentational 3-calendar-month trend for scored observations (RP / beoordeling).
// Uses original eventDate, not the later data-entry date. No permission or
// personnel decision can be inferred from these statistics.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
export const brusselsObservationDay=(at=new Date())=>
 new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const isDay=value=>typeof value==='string'&&DAY.test(value)&&
 !Number.isNaN(Date.parse(value+'T12:00:00Z'))&&
 new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function threeMonthCutoff(today=brusselsObservationDay()){
 if(!isDay(today))throw Error('Ongeldige controledatum');
 const [year,month,day]=today.split('-').map(Number);
 const monthZero=month-1-3,first=new Date(Date.UTC(year,monthZero,1,12));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12))
   .getUTCDate();
 return [first.getUTCFullYear(),String(first.getUTCMonth()+1).padStart(2,'0'),
  String(Math.min(day,last)).padStart(2,'0')].join('-');
}
export function threeMonthObservationScore(rows,{today=brusselsObservationDay(),
 limited=false}={}){
 const from=threeMonthCutoff(today);
 const observations=(Array.isArray(rows)?rows:[]).filter(row=>{
  if((row?.type||row?.kind)!=='observatie'||row?.testRecord===true||
     row?.retired===true||row?.retiredAt||row?.deletedAt||
     ['ingetrokken','withdrawn','verwijderd'].includes(
       String(row.status||'').toLowerCase()))return false;
  if(!isDay(row.eventDate)||row.eventDate<from||row.eventDate>today)return false;
  return Number.isInteger(row.score)||typeof row.score==='string'&&
    row.score.trim()!==''&&Number.isInteger(Number(row.score));
 }).map(x=>({date:x.eventDate,score:Number(x.score),
  time:String(x.eventTime||x.createdAt||'')}))
  .filter(x=>x.score>=0&&x.score<=10)
  .sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 const count=observations.length;
 const average=count?
  Math.round(observations.reduce((a,b)=>a+b.score,0)/count*10)/10:null;
 let trend='insufficient',delta=null;
 // Compare the first and second chronological halves. Require observations
 // on distinct dates so one-day bulk entry does not claim a trajectory.
 if(!limited&&count>=2&&observations[0].date!==observations[count-1].date){
  const middle=Math.floor(count/2);
  const old=observations.slice(0,middle),recent=observations.slice(middle);
  const mean=a=>a.reduce((total,x)=>total+x.score,0)/a.length;
  delta=Math.round((mean(recent)-mean(old))*100)/100;
  trend=delta>=0.5?'up':delta<=-0.5?'down':'stable';
 }
 return {count,average,from,through:today,trend,delta,
  limited:limited===true};
}
export const observationTrendLabel=t=>
 t==='up'?'Stijgend':t==='down'?'Dalend':t==='stable'?'Stabiel':
 'Onvoldoende gegevens';
export const observationTrendSymbol=t=>
 t==='up'?'↗':t==='down'?'↘':t==='stable'?'→':'—';
