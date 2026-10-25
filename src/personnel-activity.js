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
export function validateRetrospectiveCallChange(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).some(k=>!['discordId','previousCall','expectedCurrentCall',
      'reason','recordPromotion','expectedCurrentRank'].includes(k)))
    throw Error('Ongeldige historische roepnummerwijziging');
  if(!ID.test(payload.discordId))throw Error('Kies een bestaand personeelslid');
  const checkCall=value=>{
    if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 -]{0,23}$/.test(value.trim()))
      throw Error('Roepnummer bevat ongeldige tekens');
    return value.trim();
  };
  const previousCall=checkCall(payload.previousCall),
    expectedCurrentCall=checkCall(payload.expectedCurrentCall);
  if(previousCall.toLowerCase()===expectedCurrentCall.toLowerCase())
    throw Error('Oud en nieuw roepnummer mogen niet identiek zijn');
  const reason=typeof payload.reason==='string'?payload.reason.trim():'';
  if(reason.length<15||reason.length>500||/[\x00-\x1f\x7f<>]/.test(reason))
    throw Error('Motivering van minimaal 15 en maximaal 500 tekens vereist');
  if(payload.recordPromotion!==undefined&&typeof payload.recordPromotion!=='boolean')
    throw Error('Ongeldige promotiekeuze');
  const recordPromotion=payload.recordPromotion===true;
  if(recordPromotion&&(
    typeof payload.expectedCurrentRank!=='string'||
    !payload.expectedCurrentRank.trim()||payload.expectedCurrentRank.trim().length>100||
    /[\x00-\x1f\x7f<>]/.test(payload.expectedCurrentRank)))
    throw Error('Actuele rang ontbreekt of is ongeldig');
  if(!recordPromotion&&payload.expectedCurrentRank!==undefined)
    throw Error('Rang mag alleen bij een promotie worden opgegeven');
  return {discordId:payload.discordId,previousCall,expectedCurrentCall,reason,
    recordPromotion,expectedCurrentRank:recordPromotion?payload.expectedCurrentRank.trim():null};
}
export function staffActivityEvent(id,data){
  if(!data||!SERVICES.has(data.dept)||!ID.test(data.discordId))return null;
  if(!['promotion','demotion','rank_changed','callsign_changed','name_changed'].includes(data.type))return null;
  const at=when(data.at);
  if(!at)return null;
  const before=trim(data.before,100),after=trim(data.after,100);
  if(!after||before===after)return null;
  return {id:'audit:'+String(id).slice(0,100),type:data.type,
    dept:data.dept,discordId:data.discordId,
    name:trim(data.name,120)||'Personeelslid',before,after,at,
    retrospective:data.source==='retrospective_manual'};
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
