// Legacy sheet comparison is read-only. Only the signed FiveM telemetry
// pipeline may produce automatic dossier evidence, notifications and pings.
import {google} from 'googleapis';
import {canViewPersonnel,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {activityOverview} from './activity-center-model.js';
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
export function installActivityCenterRoutes(app,{requireUser,getSnapshot,readSheet=loadSheet}){
 app.get('/api/activity-center/overview',requireUser,async(req,res)=>{
  const scopes=DEPTS.filter(dept=>canViewPersonnel(req.bpd,dept));
  if(!scopes.length)return res.status(403).json({error:'Geen toegang tot activiteitsopvolging'});
  try{
   const [snapshot,rows]=await Promise.all([getSnapshot(),readSheet()]);
   if(snapshot.stale||!Array.isArray(snapshot.data))
    return res.status(503).json({error:'Actuele personeelsbron tijdelijk niet controleerbaar'});
   const allowed=snapshot.data.filter(person=>scopes.includes(person.dept)&&
    /^\d{15,22}$/.test(String(person.personId||''))&&
    canReadPersonnelSubject(req.bpd,person));
   // The source may include other services or users, but only the CURRENT
   // server-authorized roster may ever be returned to the browser.
   const today=todayBrussels();
   const summary=activityOverview(allowed,rows,today);
   res.set('Cache-Control','private, no-store');
   return res.json({...summary,asOf:today,readOnly:true,
    departments:[...new Set(allowed.map(p=>p.dept))]});
  }catch(err){
   console.warn('Activiteitscentrum: bron onbeschikbaar',err?.code||'controle_mislukt');
   return res.status(503).json({error:'Activiteitscentrum tijdelijk niet beschikbaar. Controleer bronrechten en synchronisatie.'});
  }
 });
}
