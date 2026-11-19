// Personal inactivity notices are linked to exactly one canonical dossier entry.
// The same entry is automatically included in the department's fortnight report.
export const INACTIVITY_PING_NOTICES='bpd_personal_inactivity_pings';
const ID=/^\d{15,22}$/;
const ENTRY=/^[a-zA-Z0-9]{12,30}$/;
const DEPTS=new Set(['politie','brandweer','ambulance','depannage','burger']);
const clean=x=>String(x??'').trim();
export function validPingId(id){return ENTRY.test(clean(id));}
export function inactivityPingNotice({dept,discordId,entryId,details,actor,source='manual',kind=null}){
 if(!DEPTS.has(dept)||!ID.test(clean(discordId))||!validPingId(entryId)||
    !['manual','automatic'].includes(source)||
     !(kind===null||['50/50','INACTIEF'].includes(kind))||
    !clean(details)||clean(details).length>4000)throw Error('Ongeldige activiteitenping');
 return {
  type:'inactiviteitsping',dept,targetDiscordId:discordId,
  caseId:dept+'_'+discordId,entryId,
  details:clean(details),kind, sentBy:{
   name:clean(actor?.name).slice(0,120)||'BelgiumPD',
   call:clean(actor?.call).slice(0,24)
  },source,status:'sent'
 };
}
export function publicPingNotice(id,record){
 if(!validPingId(id)||record?.type!=='inactiviteitsping'||
    record?.status==='verwijderd'||record?.retired?.at!=null)return null;
 const iso=x=>x?.toDate?.()?.toISOString?.()||null;
 return {
  id,department:clean(record.dept),details:clean(record.details).slice(0,4000),
  sentBy:clean(record.sentBy?.name).slice(0,120),
  kind:['50/50','INACTIEF'].includes(record.kind)?record.kind:null,
  sentAt:iso(record.createdAt),readAt:iso(record.readAt),
  status:record.status==='read'?'read':'sent'
 };
}
