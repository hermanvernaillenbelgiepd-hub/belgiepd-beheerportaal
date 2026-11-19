// A leave-return CHECKING is an operational review, never an automatic
// dismissal, Discord ping, or unverified change to the official personnel list.
// All dates are Belgium-local calendar days, represented as YYYY-MM-DD.
export const RETURN_CHECK_COLLECTION='bpd_leave_return_checks';
export const RETURN_CHOICES=Object.freeze(['ACTIEF','50/50']);
const ID=/^\d{15,22}$/;
const DEPTS=new Set(['politie','brandweer','ambulance','depannage']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export function brusselsDay(date=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function daysBefore(date,days){
 if(!DATE.test(date)||!Number.isSafeInteger(days)||days<0)throw Error('Ongeldige controledatum');
 return new Date(Date.parse(date+'T12:00:00Z')-days*86400000)
  .toISOString().slice(0,10);
}
export function returnCheckId(dept,id,endDate){
 if(!DEPTS.has(dept)||!ID.test(String(id))||!DATE.test(String(endDate)))
  throw Error('Ongeldige verlofcontrole');
 return dept+'_'+id+'_'+endDate;
}
export function dueLeaveReturns(approved,roster,today=brusselsDay(),lookbackDays=14){
 if(!DATE.test(today))throw Error('Ongeldige controledatum');
 const earliest=daysBefore(today,lookbackDays),byId=new Map();
 for(const row of approved||[]){
  if(row?.status!=='approved'||!ID.test(String(row.personDiscordId||''))||
     !DATE.test(row.startDate||'')||!DATE.test(row.endDate||'')||
     row.startDate>row.endDate||row.historicalImport===true)continue;
  const old=byId.get(row.personDiscordId)||[];
  old.push(row);byId.set(row.personDiscordId,old);
 }
 const result=[],seen=new Set();
 for(const person of roster||[]){
  const dept=person?.dept,id=String(person?.personId||'');
  if(!DEPTS.has(dept)||!ID.test(id)||person.lifecycleState==='archived'||
    person.lifecycleState==='pending')continue;
  if(/^(?:geschors[t]?|verwijderd|ontslag|blacklisted)$/i.test(String(person.status||'')))continue;
  const leaves=byId.get(id)||[];
  // An approved leave active today, including an approved extension, prevents
  // early CHECKING. The last finished period is the return anchor.
  if(leaves.some(x=>x.startDate<=today&&x.endDate>=today))continue;
  const ended=leaves.filter(x=>x.endDate<today&&x.endDate>=earliest)
    .sort((a,b)=>b.endDate.localeCompare(a.endDate));
  if(!ended.length)continue;
  const endDate=ended[0].endDate,key=dept+':'+id;
  if(seen.has(key))continue;
  seen.add(key);
  result.push({id:returnCheckId(dept,id,endDate),dept,discordId:id,
   endDate,subjectName:String(person.name||'Personeelslid').slice(0,120),
   subjectCall:String(person.call||'').slice(0,24)});
 }
 return result;
}
export function returnCheckPublic(row){
 if(!row||!DEPTS.has(row.dept)||!ID.test(row.discordId)||
   !DATE.test(row.endDate))return null;
 return {id:returnCheckId(row.dept,row.discordId,row.endDate),
  dept:row.dept,discordId:row.discordId,endDate:row.endDate,
  status:RETURN_CHOICES.includes(row.status)?row.status:'CHECKING',
  subjectName:String(row.subjectName||'Personeelslid').slice(0,120),
  subjectCall:String(row.subjectCall||'').slice(0,24),
  resolvedAt:row.resolvedAt?.toDate?.()?.toISOString?.()||null};
}
