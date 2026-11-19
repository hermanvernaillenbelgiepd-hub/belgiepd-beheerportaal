// Read-only reconstruction for old leave events displayed in privileged
// fortnight reports. The immutable case event, its date and its author
// metadata are never rewritten in Firestore.
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const GENERIC=new Set(['politioneel kader','bevoegd kaderlid','onbekend','']);
const safeName=x=>typeof x==='string'?x.trim().slice(0,120):'';
const fmtDate=value=>ISO.test(value||'')?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
function matchingActor(original,request,roster){
 const a=original?.registeredBy||{},label=safeName(a.name);
 if(!GENERIC.has(label.toLowerCase()))return a;
 const matching=Array.isArray(roster)?roster.filter(p=>
   p.dept===original.dept&&p.personId===a.discordId):[];
 if(original.leaveAction==='manual_approved'||
   original.leaveAction==='manual_submitted'){
   const submitter=request.submittedByActor;
   if(submitter&&submitter.discordId===a.discordId&&
      safeName(submitter.name)&&!GENERIC.has(safeName(submitter.name).toLowerCase()))
     return {name:safeName(submitter.name),call:String(submitter.call||'').slice(0,24),
       discordId:String(a.discordId||'')};
 }
 if(matching.length===1&&safeName(matching[0].name))
   return {name:safeName(matching[0].name)+' (huidige naam)',
     call:String(matching[0].call||'').slice(0,24),
     discordId:String(a.discordId||'')};
 return a;
}
export function projectLeaveReportEvent(entry,request,roster=[]){
 if(entry?.type!=='verlof'||!request||typeof request!=='object'||
   entry.subjectDiscordId!==request.personDiscordId||
   !Array.isArray(request.subjectDepartments)||
   !request.subjectDepartments.includes(entry.dept))
  return entry;
 let details=String(entry.details||'').slice(0,6000);
 const note=typeof request.note==='string'?request.note.trim().slice(0,300):'';
 if(note&&!details.includes('Verlofreden:'))
  details+=(details?' · ':'')+'Verlofreden: '+note;
 // An already finished holiday entered later is an administrative EVENT
 // today, but the actual leave dates belong to its earlier interval.
 // Preserve both; never silently move an old event to another fortnight.
 const isRetrospective=request.manual===true&&
   ISO.test(request.endDate||'')&&ISO.test(entry.eventDate||'')&&
   request.endDate<entry.eventDate;
 if(isRetrospective&&!details.includes('Achteraf geregistreerd:'))
  details+=(details?' · ':'')+'Achteraf geregistreerd: de datum in deze regel is de administratieve registratiedatum ('+
   fmtDate(entry.eventDate)+'); het verlof liep van '+fmtDate(request.startDate)+
   ' t.e.m. '+fmtDate(request.endDate);
 const registeredBy=matchingActor(entry,request,roster);
 if(details===entry.details&&registeredBy===entry.registeredBy)return entry;
 return {...entry,details,registeredBy};
}
