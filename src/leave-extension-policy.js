import {calendarDays,parseDay} from './leave-policy.js';

const DAY=24*60*60*1000;
export function leaveNextDay(date){
  return new Date(parseDay(date)+DAY).toISOString().slice(0,10);
}
// Een nieuwe korte periode mag nooit de goedkeuring voor een aansluitend
// bestaand verlof omzeilen.
export function leavePeriodsTouch(a,b){
  if(!a?.startDate||!a?.endDate||!b?.startDate||!b?.endDate)return false;
  return a.startDate<=leaveNextDay(b.endDate)&&b.startDate<=leaveNextDay(a.endDate);
}
export function activeLeaveCollision(records,candidate){
  return records.some(row=>['approved','pending'].includes(row.status)&&
    leavePeriodsTouch(row,candidate));
}
// Bereken vanaf het begin van alle aaneengesloten goedgekeurde perioden.
export function planLeaveExtension(base,newEndDate,records,today){
  if(!base||base.status!=='approved')
    throw new Error('Alleen een goedgekeurde verlofperiode kan worden verlengd.');
  if(base.endDate<today)
    throw new Error('Een verstreken verlofperiode kan niet via zelfbediening verlengd worden.');
  parseDay(newEndDate);
  let start=base.startDate,end=base.endDate,changed=true;
  const approved=records.filter(row=>row.status==='approved');
  while(changed){
    changed=false;
    for(const row of approved){
      if(!leavePeriodsTouch({startDate:start,endDate:end},row))continue;
      if(row.startDate<start){start=row.startDate;changed=true}
      if(row.endDate>end){end=row.endDate;changed=true}
    }
  }
  const extraStart=leaveNextDay(end);
  if(newEndDate<extraStart)
    throw new Error('Kies een nieuwe einddatum na de laatst goedgekeurde verlofdag.');
  const extra={startDate:extraStart,endDate:newEndDate};
  if(records.some(row=>row.status==='pending'&&leavePeriodsTouch(row,extra)))
    throw new Error('Er loopt al een aansluitende verlofaanvraag. Wacht eerst de beslissing af.');
  if(approved.some(row=>leavePeriodsTouch(row,extra)))
    throw new Error('Deze verlenging sluit aan bij een andere goedgekeurde periode. Contacteer het kader.');
  return {startDate:extraStart,endDate:newEndDate,days:calendarDays(extraStart,newEndDate),
    periodStartDate:start,totalPeriodDays:calendarDays(start,newEndDate)};
}
