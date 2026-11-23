// Activity chart input comes exclusively from the server-authorized filtered personnel view.
const list=items=>Array.isArray(items)?items.filter(x=>x&&typeof x==='object'):[];
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export const STATUS=[
 ['active','Actief'],['half','50/50'],['inactive','Inactief'],
 ['leave','Verlof'],['checking','Checking'],['other','Overig']
];
export const ABSENCE=[
 ['low','0–14 effectieve dagen'],['half','15–29 effectieve dagen'],
 ['inactive','30–59 effectieve dagen'],['review','60+ · beoordeling'],
 ['leave','Goedgekeurd verlof'],['unknown','Onvoldoende gegevens']
];
export function chartStatuses(people){
 const counts=Object.fromEntries(STATUS.map(([key])=>[key,0]));
 for(const p of list(people)){
  const status=String(p.currentStatus||'').trim().toLowerCase();
  const key=p.returnChecking===true?'checking':p.leave?.active===true?'leave':
   ['actief','active'].includes(status)?'active':status==='50/50'?'half':
   status==='inactief'?'inactive':'other';
  counts[key]++;
 }
 return STATUS.map(([key,label])=>({key,label,value:counts[key]}));
}
export function chartAbsence(people,leaveComplete){
 const counts=Object.fromEntries(ABSENCE.map(([key])=>[key,0]));
 for(const p of list(people)){
  const d=valid(p.effectiveInactiveDays);
  const key=leaveComplete!==true?'unknown':p.leave?.active===true?'leave':
   d===null?'unknown':d>=60?'review':d>=30?'inactive':d>=15?'half':'low';
  counts[key]++;
 }
 return ABSENCE.map(([key,label])=>({key,label,value:counts[key]}));
}
const date=/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
export function chartHoursSources(people){
 const rows=list(people),sources=[];
 const verified=rows.filter(p=>p.verified===true&&valid(p.periodPlayHours)!==null);
 if(verified.length)sources.push({key:'verified',type:'verified',label:'Geverifieerde afgesloten maand',count:verified.length});
 const dates=new Set();
 for(const p of rows)for(const h of Array.isArray(p.historicalRecords)?p.historicalRecords:[])
  if(date.test(String(h?.date||''))&&valid(h.hours)!==null)dates.add(h.date);
 for(const d of [...dates].sort().reverse()){
  const count=rows.filter(p=>Array.isArray(p.historicalRecords)&&
   p.historicalRecords.some(h=>h?.date===d&&valid(h.hours)!==null)).length;
  sources.push({key:'historic:'+d,type:'historic',date:d,count,
   label:'RECORDS-peilstand '+d.slice(8)+'/'+d.slice(5,7)+'/'+d.slice(0,4)});
 }
 return sources;
}
export function chartHoursRank(people,source,limit=10){
 if(!source||!Number.isInteger(limit)||limit<1||limit>100)return {top:[],bottom:[],all:[]};
 const all=[];
 for(const p of list(people)){
  let hours=null;
  if(source.type==='verified'&&p.verified===true)hours=valid(p.periodPlayHours);
  if(source.type==='historic'){
   const hits=(Array.isArray(p.historicalRecords)?p.historicalRecords:[])
    .filter(h=>h?.date===source.date&&valid(h.hours)!==null);
   if(hits.length===1)hours=valid(hits[0].hours);
  }
  if(hours===null)continue;
  all.push({name:String(p.name||'—'),call:String(p.call||'—'),hours});
 }
 const byHours=(a,b)=>b.hours-a.hours||a.call.localeCompare(b.call,'nl');
 return {top:[...all].sort(byHours).slice(0,limit),
  bottom:[...all].sort((a,b)=>a.hours-b.hours||a.call.localeCompare(b.call,'nl')).slice(0,limit),all};
}
