// Reversible, service-scoped personnel lifecycle. All historical dossiers stay
// in their original collections; this register controls active roster display.
export const PERSONNEL_LIFECYCLE_COLLECTION='bpd_personnel_lifecycle';
export const LIFECYCLE_SERVICES=Object.freeze(['politie','brandweer','ambulance','depannage']);
const SERVICE=new Set(LIFECYCLE_SERVICES);
const ID=/^\d{15,22}$/;
export const lifecycleKey=(dept,id)=>SERVICE.has(dept)&&ID.test(String(id||''))?
 dept+'_'+id:null;
export const ARCHIVE_REASONS=Object.freeze(['voluntary_discord_leave','management_dismissal',
 'service_resignation','other']);
export function validateLifecycleAction(body,action){
 if(!['archive','restore'].includes(action)||!body||typeof body!=='object'||
    Array.isArray(body))throw Error('Ongeldige personeelsactie');
 const allowed=action==='archive'?
  ['reason','cause','expectedRevision']:['reason','expectedRevision'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw Error('Onbekende personeelsactie');
 const reason=String(body.reason||'').trim();
 if(reason.length<10||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw Error('Motivering moet 10 tot 500 tekens bevatten');
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
  throw Error('Het archief is intussen gewijzigd. Vernieuw de personeelsfiche');
 const cause=action==='archive'?String(body.cause||''):'return_to_service';
 if(action==='archive'&&!ARCHIVE_REASONS.includes(cause))
  throw Error('Kies een geldige ontslagreden');
 return {reason,cause,expectedRevision:body.expectedRevision};
}
export function lifecycleSourceSnapshot(p){
 if(!p||!lifecycleKey(p.dept,p.personId))return null;
 return {dept:p.dept,personId:p.personId,
  name:String(p.name||'').slice(0,120),call:String(p.call||'').slice(0,24),
  rank:String(p.rank||'').slice(0,100),series:String(p.series||'').slice(0,100),
  seriesRaw:String(p.seriesRaw||'').slice(0,100),
  status:String(p.status||'').slice(0,100),
  specialties:Array.isArray(p.specialties)?p.specialties.slice(0,100)
   .filter(s=>s&&typeof s.label==='string'&&typeof s.value==='string')
   .map(s=>({label:s.label.slice(0,90),value:s.value.slice(0,90),
     source:s.source==='manual'?'manual':'historical'})):[],
  hours:Number.isFinite(p.hours)?p.hours:null,
  totalHours:Number.isFinite(p.totalHours)?p.totalHours:null,
  lastConnection:typeof p.lastConnection==='string'?p.lastConnection.slice(0,80):null};
}
export function overlayPersonnelLifecycle(records,docs,{includeArchived=false}={}){
 const byKey=new Map();
 for(const doc of docs||[]){
  const id=typeof doc?.id==='string'?doc.id:null;
  const d=typeof doc?.data==='function'?doc.data():doc;
  const key=lifecycleKey(d?.dept,d?.discordId);
  if(!key||(id&&id!==key)||byKey.has(key)||
     !['archived','active'].includes(d.state))continue;
  byKey.set(key,d);
 }
 const out=[],seen=new Set();
 for(const p of records||[]){
  const key=lifecycleKey(p?.dept,p?.personId);
  const state=key?byKey.get(key):null;
  if(key)seen.add(key);
  if(state?.state==='archived'){
   if(includeArchived)out.push({...p,lifecycleState:'archived',lifecycleRevision:state.revision,
     lifecycleCause:state.cause||'',lastPersonnelAction:'archived'});
  }else out.push(state?{...p,lifecycleState:'active',
    lifecycleRevision:state.revision,lastPersonnelAction:state.cause||'restored'}:p);
 }
 // A returning worker may have disappeared from the old Google spreadsheet.
 // Their archived identity is never lost and is restored only by a signed,
 // audited, explicitly active lifecycle decision.
 for(const [key,d] of byKey){
  if(seen.has(key)||!d.snapshot||!lifecycleKey(d.snapshot.dept,d.snapshot.personId)||
     key!==lifecycleKey(d.snapshot.dept,d.snapshot.personId))continue;
  if(d.state==='archived'&&!includeArchived)continue;
  if(d.state==='active'&&d.restoreFromArchive!==true)continue;
  const p={...d.snapshot,id:d.dept+':'+d.discordId,
    specialties:Array.isArray(d.snapshot.specialties)?d.snapshot.specialties:[],
    special:'Geen geregistreerde specialisaties',source:'firestore-lifecycle',
    lifecycleState:d.state,lifecycleRevision:d.revision,
    lastPersonnelAction:d.cause||'restored'};
  out.push(p);
 }
 return out;
}
export function possibleDiscordDepartures(records,snapshot){
 if(snapshot?.status!=='ok'||!(snapshot.entries instanceof Map))return [];
 const groups=new Map(),duplicate=new Set();
 for(const p of records||[]){
  const key=lifecycleKey(p?.dept,p?.personId);
  if(!key)continue;
  if(groups.has(key))duplicate.add(key);
  groups.set(key,p);
 }
 return [...groups].filter(([key,p])=>!duplicate.has(key)&&
   !snapshot.entries.has(p.personId)).map(([,p])=>({
    dept:p.dept,discordId:p.personId,name:String(p.name||'').slice(0,120),
    call:String(p.call||'').slice(0,24),evidence:'not_in_successful_api_snapshot'
  }));
}
