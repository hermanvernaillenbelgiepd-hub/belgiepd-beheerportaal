// Legacy sheet comparison is read-only. Only the signed FiveM telemetry
// pipeline may produce automatic dossier evidence, notifications and pings.
import {google} from 'googleapis';
import {canViewPersonnel,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {activityOverview} from './activity-center-model.js';
import {getFirestore} from 'firebase-admin/firestore';
import {ACTIVITY_COLLECTION} from './activity-ping-policy.js';
import {RETURN_CHECK_COLLECTION} from './activity-return-policy.js';
import {enrichActivityRow,dossierPingSummary,activityCenterStatistics}
 from './activity-center-details.js';
const DEPTS=['politie','brandweer','ambulance','depannage'];
const SHEET_RANGE='ACTIVITEITSCHECK!A2:Z200';
const MAX_ROWS=200;
let cached=null,expires=0,pending=null;
async function loadSheet(){
 if(cached&&expires>Date.now())return cached;
 if(pending)return pending;
 pending=(async()=>{
  const spreadsheetId=String(process.env.BPD_ACTIVITY_CENTER_SPREADSHEET_ID||
    process.env.ACTIVITY_SPREADSHEET_ID||'').trim();
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(spreadsheetId))throw Error('Activiteitsbron ontbreekt');
  const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const sheets=google.sheets({version:'v4',auth});
  const response=await sheets.spreadsheets.values.get({spreadsheetId,
   range:SHEET_RANGE,valueRenderOption:'FORMATTED_VALUE'});
  const rows=response.data.values||[];
  if(!Array.isArray(rows)||rows.length<2||rows.length>MAX_ROWS||
    !Array.isArray(rows[0])||!String(rows[0][4]||'').includes('Discord'))
   throw Error('Activiteitsspreadsheet bevat niet de verwachte kolommen');
  cached=rows;expires=Date.now()+90_000;
  return rows;
 })().finally(()=>{pending=null});
 return pending;
}
const todayBrussels=()=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
// An unavailable legacy sheet must not prevent reporting verified Firestore
// evidence. No GET endpoint sends pings or changes personnel statuses.
const loadOptionalSheet=async readSheet=>{
 try{return {rows:await readSheet(),available:true}}
 catch{return {rows:[],available:false}}
};
async function loadVerifiedById(db,ids){
 const map=new Map();
 for(let i=0;i<ids.length;i+=100){
  const docs=await db.getAll(...ids.slice(i,i+100)
   .map(id=>db.collection(ACTIVITY_COLLECTION).doc(id)));
  for(const d of docs)if(d.exists)map.set(d.id,d.data());
 }
 return map;
}
async function loadDossierPings(db,people){
 const map=new Map();
 // Per-subject bounded reads avoid unscoped collection-group queries or
 // exposing other service files. At most 100 recent entries are counted.
 for(let i=0;i<people.length;i+=20){
  const slice=people.slice(i,i+20);
  const data=await Promise.allSettled(slice.map(p=>
   db.collection('bpd_cases').doc(p.dept+'_'+p.personId).collection('entries')
    .where('type','==','inactiviteitsping').limit(100).get()));
  for(let j=0;j<slice.length;j++){
   const item=data[j];
   if(item.status==='fulfilled'){
    map.set(slice[j].dept+':'+slice[j].personId,
     dossierPingSummary(item.value.docs.map(d=>d.data())));
   }
  }
 }
 return map;
}
export function installActivityCenterRoutes(app,{requireUser,getSnapshot,readSheet=loadSheet}){
 app.get('/api/activity-center/overview',requireUser,async(req,res)=>{
  const scopes=DEPTS.filter(dept=>canViewPersonnel(req.bpd,dept));
  if(!scopes.length)return res.status(403).json({error:'Geen toegang tot activiteitsopvolging'});
  try{
   const [snapshot,legacy]=await Promise.all([getSnapshot(),loadOptionalSheet(readSheet)]);
   if(snapshot.stale||!Array.isArray(snapshot.data))
    return res.status(503).json({error:'Actuele personeelsbron tijdelijk niet controleerbaar'});
   const allowed=snapshot.data.filter(person=>scopes.includes(person.dept)&&
    /^\d{15,22}$/.test(String(person.personId||''))&&
    canReadPersonnelSubject(req.bpd,person)&&
    person.lifecycleState!=='archived');
   if(allowed.length>500)
    return res.status(503).json({error:'Te veel personeelsleden voor een volledig beveiligd overzicht'});
   const db=getFirestore(),today=todayBrussels();
   const summary=activityOverview(allowed,legacy.rows,today);
   const uniqueIds=[...new Set(allowed.map(p=>p.personId))];
   const [approvedResult,verifiedResult,pingsResult,checkingResult]=await Promise.allSettled([
    db.collection('bpd_leave_requests').where('status','==','approved').limit(1501).get(),
    loadVerifiedById(db,uniqueIds),
    loadDossierPings(db,allowed),
    process.env.BPD_ENABLE_LEAVE_RETURN_CHECKS==='true'
     ?db.collection(RETURN_CHECK_COLLECTION).where('status','==','CHECKING').limit(501).get()
     :Promise.resolve({docs:[],size:0})
   ]);
   // Fail closed on incomplete leave results: no unsafe activity suggestion.
   const leaveComplete=approvedResult.status==='fulfilled'&&
    approvedResult.value.size<=1500;
   const leaves=new Map();
   if(leaveComplete){
    for(const doc of approvedResult.value.docs){
     const data=doc.data(),id=data.personDiscordId;
     if(!/^\d{15,22}$/.test(String(id||'')))continue;
     if(!leaves.has(id))leaves.set(id,[]);
     leaves.get(id).push(data);
    }
   }
   const verified=verifiedResult.status==='fulfilled'?verifiedResult.value:new Map();
   const pings=pingsResult.status==='fulfilled'?pingsResult.value:new Map();
   const checking=new Map();
   if(checkingResult.status==='fulfilled'&&checkingResult.value.size<=500){
    for(const doc of checkingResult.value.docs){
     const x=doc.data();
     checking.set(x.dept+':'+x.discordId,x);
    }
   }
   const now=new Date(),people=summary.people.map(row=>{
    const item=allowed.find(p=>p.dept===row.department&&p.personId===row.discordId);
    const source=verified.get(row.discordId);
    const valid=source?.guildId===process.env.DISCORD_GUILD_ID?source:null;
    const copy=enrichActivityRow(row,{verified:valid,
     leaves:leaveComplete?leaves.get(row.discordId)||[]:[],
     pings:pings.get(row.department+':'+row.discordId)||null,
     returnCheck:checking.get(row.department+':'+row.discordId)||null,
     today,now});
    if(!leaveComplete){
     copy.leave={active:null,startDate:null,endDate:null,nextStart:null,nextEnd:null,lastEnded:null};
     if(copy.verified&&copy.kind!=='checking'){
      copy.kind='verouderd';
      copy.reason='Goedgekeurd verlof is niet volledig verifieerbaar; geen veilig activiteitsadvies';
     }
    }
    if(!item)return null;
    return copy;
   }).filter(Boolean);
   res.set('Cache-Control','private, no-store');
   return res.json({people,counts:summary.counts,
    statistics:activityCenterStatistics(people),asOf:today,readOnly:true,
    departments:[...new Set(allowed.map(p=>p.dept))],
    source:{...summary.source,legacyAvailable:legacy.available,
     approvedLeaveComplete:leaveComplete,verifiedAvailable:verifiedResult.status==='fulfilled',
     dossierPingsAvailable:pingsResult.status==='fulfilled',
     leaveReturnChecksAvailable:checkingResult.status==='fulfilled'}});
  }catch(err){
   console.warn('Activiteitscentrum: overzicht onbeschikbaar',err?.code||'controle_mislukt');
   return res.status(503).json({error:'Activiteitscentrum tijdelijk niet beschikbaar. Controleer personeelsbron en Firebase.'});
  }
 });
}
