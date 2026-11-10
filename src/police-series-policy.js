// BelgiumPD Police REEKS assignments. Never grants Discord ranks or rights.
export const POLICE_SERIES_COLLECTION='bpd_police_series_assignments';
export const POLICE_SERIES_CONTROL='bpd_police_series_control';
export const SERIES=Object.freeze([1,2,3]);
const ID=/^\d{15,22}$/;
export function policeSeriesNumber(value){
 const raw=String(value??'').trim();
 const match=/^(?:(?:reeks|serie|series)\s*0?([1-3])|R0?([1-3])|0?([1-3]))$/i.exec(raw);
 return match?Number(match[1]||match[2]||match[3]):null;
}
export function isFixedPoliceAgent(p){
 if(p?.dept!=='politie')return false;
 const m=/^(?:S[- ]?)?([2-8]\d\d)$/i.exec(String(p.call||'').trim());
 return !!m;
}
const inRoster=p=>p?.dept==='politie'&&!/^(?:ontslag|verwijderd|blacklisted|ontslagen)$/i.test(String(p.status||'').trim());
// Older series documents stay in the archive after an identity transfer.
 // Exclude only the old identifiers from active balancing; the new record
 // retains the same series and is counted once.
export function activePoliceSeriesDocuments(assignments=[],aliases=[]){
 const oldIds=new Set();
 for(const raw of aliases){
  const alias=typeof raw?.data==='function'?raw.data():raw;
  const oldId=raw?.id||alias?.oldDiscordId;
  if(alias?.status==='completed'&&ID.test(String(oldId||''))&&
     ID.test(String(alias.newDiscordId||''))&&oldId!==alias.newDiscordId)
   oldIds.add(oldId);
 }
 return assignments.filter(raw=>{
  const d=typeof raw?.data==='function'?raw.data():raw;
  return !oldIds.has(raw?.id||d?.discordId);
 });
}
export function seriesCounts(records,assignments=[],excludedId=''){
 const byId=new Map();
 for(const raw of assignments){
  const doc=raw?.data?raw.data():raw;
  if(doc?.dept==='politie'&&ID.test(String(doc.discordId||''))&&
    policeSeriesNumber(doc.series)!==null)byId.set(doc.discordId,policeSeriesNumber(doc.series));
 }
 const counts={1:0,2:0,3:0},ids=new Set();
 for(const p of records||[]){
  if(!inRoster(p)||p.personId===excludedId)continue;
  const id=String(p.personId||'');
  if(ids.has(id))continue;
  ids.add(id);
  const n=byId.get(id)||policeSeriesNumber(p.seriesRaw)||policeSeriesNumber(p.series);
  if(n!==null&&n!==undefined)counts[n]++;
 }
 for(const [id,n] of byId)if(!ids.has(id)&&id!==excludedId)counts[n]++;
 return counts;
}
export function firstBalancedPoliceSeries(records,assignments=[],excludedId=''){
 const counts=seriesCounts(records,assignments,excludedId);
 return SERIES.reduce((best,n)=>counts[n]<counts[best]?n:best,1);
}
export function overlayPoliceSeriesAssignments(records,assignments=[]){
 const map=new Map();
 for(const raw of assignments){
  const p=raw?.data?raw.data():raw;
  if(p?.dept==='politie'&&ID.test(String(p.discordId||''))&&
    policeSeriesNumber(p.series)!==null)map.set(p.discordId,{series:policeSeriesNumber(p.series),revision:Number.isSafeInteger(p.revision)?p.revision:1});
 }
 return (records||[]).map(p=>{
  if(p?.dept!=='politie')return p;
  const record=map.get(p.personId);
  const n=record?.series;
  return n?{...p,series:'Reeks '+n,seriesRaw:String(n),
    policeSeriesSource:'firestore',policeSeriesRevision:record.revision}:p;
 });
}
// Only a controlled fixed-call issuance gets an automatic series. Existing
// official 1/2/3 memberships are never replaced by a first-time allocator.
export function needsPoliceSeriesAssignment(person,assignments=[]){
 if(!isFixedPoliceAgent(person)||!ID.test(String(person.personId||'')))return false;
 const exists=assignments.some(x=>{
  const d=x?.data?x.data():x;
  return d?.discordId===person.personId&&d?.dept==='politie'&&
   policeSeriesNumber(d.series)!==null;
 });
 return !exists&&policeSeriesNumber(person.seriesRaw)===null&&
  policeSeriesNumber(person.series)===null;
}
export function validatePoliceSeriesChange(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['series','reason','expectedRevision'].includes(k)))
  throw Error('Ongeldige reekswijziging');
 const series=policeSeriesNumber(body.series);
 if(series===null)throw Error('Selecteer Reeks 1, 2 of 3');
 const reason=String(body.reason||'').trim();
 if(reason.length<15||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering reekswissel: 15–500 tekens');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw Error('Vernieuw de personeelsfiche voor je een reeks wijzigt');
 return {series,reason,expectedRevision:body.expectedRevision};
}
