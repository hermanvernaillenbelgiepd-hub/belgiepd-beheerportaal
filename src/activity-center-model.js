// Read-only interpretation of legacy activity spreadsheet columns.
// Never use these unverified spreadsheet snapshots to create pings or change personnel.
const ID=/^\d{15,22}$/;
const str=v=>String(v??'').trim();
function dateValue(value){
 const v=str(value);
 const match=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(v);
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
 const year=Number(match?.[3]||iso?.[1]),month=Number(match?.[2]||iso?.[2]),day=Number(match?.[1]||iso?.[3]);
 if(!year||!month||!day||year<2015||year>2100)return null;
 const at=new Date(Date.UTC(year,month-1,day));
 if(at.getUTCFullYear()!==year||at.getUTCMonth()!==month-1||at.getUTCDate()!==day)return null;
 return at.toISOString().slice(0,10);
}
function number(value){
 const s=str(value).replace(',','.');
 return /^\d+(?:\.\d+)?$/.test(s)?Number(s):null;
}
export function belgianDate(value){return dateValue(value)}
export function calendarDays(start,end){
 if(!start||!end)return null;
 const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');
 return Number.isFinite(a)&&Number.isFinite(b)?Math.floor((b-a)/86400000):null;
}
export function activitySheetRows(rows){
 const items=new Map(),duplicate=new Set();
 for(const row of (Array.isArray(rows)?rows:[]).slice(1)){
  const id=str(row?.[4]);
  if(!ID.test(id))continue;
  if(items.has(id)){items.delete(id);duplicate.add(id);continue}
  if(duplicate.has(id))continue;
  items.set(id,{
   lastConnection:dateValue(row[6]),lastCheck:dateValue(row[7]),
   sourceStatus:str(row[1]).slice(0,40)||null,
   sourceSuggestedStatus:str(row[14]).slice(0,40)||null,
   inactivityDaysSource:number(row[8]),lastPing:dateValue(row[9]),
   pingCount:number(row[12]),pingResponses:number(row[13]),
   leaveUntil:dateValue(row[16]),
   periodPlayHours:number(row[18]),totalPlayHours:number(row[19])
  });
 }
 return {items,duplicates:duplicate.size};
}
export function activityAssessment(activity,today){
 if(!activity)return {kind:'geen_data',days:null,reason:'Geen gekoppelde activiteit'};
 const checkedAge=calendarDays(activity.lastCheck,today);
 if(checkedAge===null||checkedAge<0||checkedAge>1)
  return {kind:'verouderd',days:null,reason:'Broncontrole ontbreekt of is verouderd'};
 if(!activity.lastConnection)
  return {kind:'geen_data',days:null,reason:'Geen bevestigde laatste verbinding in spreadsheet'};
 const days=calendarDays(activity.lastConnection,today);
 if(days===null||days<0)return {kind:'geen_data',days:null,reason:'Datum laatste verbinding ongeldig'};
 // Verlof in the legacy sheet is a review hint, NOT verified approved leave.
 if(activity.sourceStatus?.toLowerCase()==='verlof'||
    activity.leaveUntil&&activity.leaveUntil>=today)
  return {kind:'verlof_nazien',days,reason:'Verlofstatus eerst bevestigen in het dossier'};
 if(days>=60)return {kind:'beoordelen',days,reason:'60+ dagen niet online: beoordeling door leiding, nooit automatisch ontslag'};
 if(days>=30)return {kind:'inactief',days,reason:'30+ dagen geen verbinding: voorstel INACTIEF-ping'};
 if(days>=15)return {kind:'50/50',days,reason:'15+ dagen geen verbinding: voorstel 50/50-ping'};
 return {kind:'ok',days,reason:'Geen afwezigheidsdrempel bereikt'};
}
export function activityOverview(personnel,sourceRows,today){
 const {items,duplicates}=activitySheetRows(sourceRows);
 const people=(Array.isArray(personnel)?personnel:[]).map(p=>{
  const activity=items.get(p.personId)||null;
  const assessment=activityAssessment(activity,today);
  return {
   discordId:p.personId,department:p.dept,call:p.call,name:p.name,
   currentStatus:p.status,series:p.series||null,
   sourceStatus:p.dept==='politie'?activity?.sourceStatus||null:null,
   sourceSuggestedStatus:activity?.sourceSuggestedStatus||null,
   lastConnection:activity?.lastConnection||null,lastCheck:activity?.lastCheck||null,
   daysInactive:assessment.days,kind:assessment.kind,reason:assessment.reason,
   periodPlayHours:activity?.periodPlayHours??null,
   totalPlayHours:activity?.totalPlayHours??null,
   lastPing:activity?.lastPing||null,pingCount:activity?.pingCount??null,
   pingResponses:activity?.pingResponses??null,
   statusMismatch:p.dept==='politie'&&!!activity?.sourceStatus&&
    p.status.toLowerCase()!==activity.sourceStatus.toLowerCase()
  };
 });
 const counts=Object.create(null);
 for(const p of people)counts[p.kind]=(counts[p.kind]||0)+1;
 return {people,counts,source:{type:'spreadsheet_readonly',duplicates,
  matched:people.filter(p=>p.lastCheck!==null).length,
  note:'Playtimeverschil is een resetperiode, geen afgeronde kalendermaand. Geen automatische pings of statuswijzigingen op basis van deze bron.'}};
}
