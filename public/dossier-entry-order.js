// Display ordering only. Historical imports can be logged much later than
// the actual observation, so eventDate is always the primary sort key.
const validCalendarDay=(year,month,day)=>{
 const y=Number(year),m=Number(month),d=Number(day);
 if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||
    y<1900||y>2200||m<1||m>12||d<1||d>31)return '';
 const at=new Date(Date.UTC(y,m-1,d,12));
 return at.getUTCFullYear()===y&&at.getUTCMonth()===m-1&&at.getUTCDate()===d?
   String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+
    String(d).padStart(2,'0'):'';
};
export function dossierEventDay(value){
 if(typeof value!=='string')return '';
 const text=value.trim();
 let m=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
 if(m)return validCalendarDay(m[1],m[2],m[3]);
 m=text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:$|\s)/);
 return m?validCalendarDay(m[3],m[2],m[1]):'';
}
function createdTimestamp(row){
 const raw=row?.createdAt??row?.recordedAt??row?.registeredAt??'';
 if(typeof raw==='string')return raw;
 if(raw?.seconds&&Number.isSafeInteger(raw.seconds))
  return new Date(raw.seconds*1000).toISOString();
 return '';
}
function eventClock(row){
 const time=String(row?.eventTime||'').trim();
 return /^\d{2}:\d{2}(?::\d{2})?$/.test(time)?time:'';
}
function dayOf(row){
 return dossierEventDay(row?.eventDate)||
  dossierEventDay(row?.startDate)||
  dossierEventDay(row?._noteSortDate)||
  dossierEventDay(row?.date)||
  dossierEventDay(row?.at)||
  dossierEventDay(createdTimestamp(row));
}
export function compareDossierEntriesNewestFirst(a,b){
 const dayA=dayOf(a),dayB=dayOf(b);
 return dayB.localeCompare(dayA)||
   eventClock(b).localeCompare(eventClock(a))||
   createdTimestamp(b).localeCompare(createdTimestamp(a))||
   String(b?.id||'').localeCompare(String(a?.id||''));
}
export function newestDossierEntries(entries){
 return (Array.isArray(entries)?entries:[])
   .slice().sort(compareDossierEntriesNewestFirst);
}
