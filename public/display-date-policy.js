// Presentation-only formatting. Backend dates and <input type="date"> values stay ISO.
const dayPattern=/\b(\d{4})-(\d{2})-(\d{2})\b/g;
const stampPattern=/\b(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?\b/g;
export function formatDisplayDay(value){
 if(typeof value!=='string')return value;
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 if(!m)return value;
 const y=Number(m[1]),mon=Number(m[2]),d=Number(m[3]);
 const check=new Date(Date.UTC(y,mon-1,d));
 return check.getUTCFullYear()===y&&check.getUTCMonth()===mon-1&&
   check.getUTCDate()===d?m[3]+'/'+m[2]+'/'+m[1]:value;
}
export function formatVisibleDateText(raw){
 if(typeof raw!=='string'||!/\d{4}-\d{2}-\d{2}/.test(raw))return raw;
 const timestamps=raw.replace(stampPattern,(full,day,time,offset)=>{
   if(formatDisplayDay(day)===day)return full;
   if(!offset)return formatDisplayDay(day)+' '+time;
   const instant=new Date(full);
   return Number.isNaN(instant.getTime())?full:instant.toLocaleString('nl-BE',{
     timeZone:'Europe/Brussels',day:'2-digit',month:'2-digit',year:'numeric',
     hour:'2-digit',minute:'2-digit',second:time.length===8?'2-digit':undefined
   });
 });
 return timestamps.replace(dayPattern,(full)=>formatDisplayDay(full));
}
