// Authorized staff activity. This presentation projection never grants access.
export const PERSONNEL_ACTIVITY_COLLECTION='bpd_personnel_activity_events';
const ID=/^\d{15,22}$/;
const SERVICES=new Set(['politie','ambulance','brandweer','depannage']);
const trim=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const when=value=>{
  const date=value?.toDate?.()|| (value instanceof Date?value:
    typeof value==='string'?new Date(value):null);
  return date instanceof Date&&Number.isFinite(date.getTime())?date.toISOString():null;
};
export function staffActivityEvent(id,data){
  if(!data||!SERVICES.has(data.dept)||!ID.test(data.discordId))return null;
  if(!['promotion','callsign_changed'].includes(data.type))return null;
  const at=when(data.at);
  if(!at)return null;
  const before=trim(data.before,100),after=trim(data.after,100);
  if(!after||before===after)return null;
  return {id:'audit:'+String(id).slice(0,100),type:data.type,
    dept:data.dept,discordId:data.discordId,
    name:trim(data.name,120)||'Personeelslid',before,after,at};
}
export function callsignActivityEvent(id,data){
  if(!ID.test(id)||data?.status!=='approved')return null;
  const at=when(data.syncedAt);
  const after=trim(data.assignedCall,24);
  if(!at||!after)return null;
  return {id:'callsign:'+id,type:'callsign_assigned',dept:'politie',
    discordId:id,name:trim(data.name,120)||'Personeelslid',before:trim(data.temporaryCall,24),
    after,at};
}
// Older Firestore-created promotions have rankUpdatedAt even when they predate
// the new activity feed. The previous rank remains in the per-person audit.
export function createdPromotionEvent(id,data){
  if(!data||data.dept!=='politie'||!ID.test(data.discordId)||
    data.state!=='linked'||!data.rankUpdatedAt)return null;
  const at=when(data.rankUpdatedAt),after=trim(data.rank,100);
  if(!at||!after)return null;
  return {id:'existing-promotion:'+String(id).slice(0,100),type:'promotion',
    dept:'politie',discordId:data.discordId,
    name:trim(data.name,120)||'Personeelslid',before:'',after,at};
}
export function recentPersonnelActivity(auditDocs,callsignDocs,allowedDepartments,limit=8,createdDocs=[]){
  const allowed=new Set(Array.isArray(allowedDepartments)?allowedDepartments:[]);
  const tracked=(auditDocs||[]).map(doc=>staffActivityEvent(doc.id,doc.data()))
    .filter(Boolean);
  const historical=(createdDocs||[]).map(doc=>createdPromotionEvent(doc.id,doc.data()))
    .filter(row=>row&&!tracked.some(current=>current.type==='promotion'&&
      current.dept===row.dept&&current.discordId===row.discordId&&
      current.after===row.after));
  const rows=[
    ...tracked,
    ...(callsignDocs||[]).map(doc=>callsignActivityEvent(doc.id,doc.data())),
    ...historical
  ].filter(row=>row&&allowed.has(row.dept));
  const seen=new Set();
  return rows.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id))
    .filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true})
    .slice(0,Math.max(1,Math.min(20,Number.isSafeInteger(limit)?limit:8)));
}
