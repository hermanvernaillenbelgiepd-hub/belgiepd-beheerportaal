import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { buildData } from './normalize.js';
import { dossierLinksFromGrid, mayOpenLegacyDossierLink } from './dossier-links.js';
import { ALLOWED_ROLES } from './registrations.js';
import { installRegistrationRoutes } from './registration-routes.js';
import { installCallsignRoutes } from './callsign-routes.js';
import { installManagementRoutes } from './management-routes.js';
import { installDiscordOAuth } from './discord-oauth.js';
import { installRoleRoutes } from './role-routes.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.disable('x-powered-by');
app.use((_req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');next();});
app.use(express.static(path.resolve(dir,'../public'),{index:'index.html',setHeaders:res=>res.set('Cache-Control','no-store')}));
app.use('/api/registrations',express.json({limit:'24kb',strict:true}));
app.use('/api/callsigns',express.json({limit:'12kb',strict:true}));
app.use('/api/management',express.json({limit:'24kb',strict:true}));
app.use('/api/roles',express.json({limit:'4kb',strict:true}));
app.use('/api/training',express.json({limit:'8kb',strict:true}));
app.locals.discordJsonParser=express.json({limit:'2kb',strict:true});
installDiscordOAuth(app);
installRoleRoutes(app);
const allDepts=['politie','brandweer','ambulance','depannage'];
const docs={
  politie:'POLITIE!A3:R300', ambulance:'AMBULANCE!A3:K150',
  brandweer:'BRANDWEER!A3:N150', depannage:'DEPANNAGE!A3:H120'
};
const cache={expires:0,data:null,fetchedAt:null,pending:null};
const cacheMs=Math.max(1,Math.min(60,Number(process.env.SYNC_CACHE_MINUTES)||15))*60*1000;
function accessList(){
  try {
    const parsed=JSON.parse(process.env.BPD_ACCESS_JSON||'{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') return {};
    return parsed;
  } catch {throw new Error('BPD_ACCESS_JSON bevat ongeldige JSON.');}
}
async function requireUser(req,res,next){
  const bearer=req.get('Authorization')||'';
  const token=/^Bearer (\S+)$/.exec(bearer)?.[1];
  if (!token) return res.status(401).json({error:'Aanmelding vereist'});
  try {
    if (!getApps().length) initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
    const verified=await getAuth().verifyIdToken(token);
    // Alleen verifieerbare Google-auth en afzonderlijke serverallowlist.
    if (!verified.email_verified || verified.firebase?.sign_in_provider!=='google.com') return res.status(403).json({error:'Google-aanmelding vereist'});
    const email=String(verified.email||'').toLowerCase();
    const entry=accessList()[email];
    if (!entry || !Array.isArray(entry.departments) || !ALLOWED_ROLES.includes(entry.role)) return res.status(403).json({error:'Account is niet gemachtigd voor de koppeling'});
    const departments=entry.departments.filter(d=>allDepts.includes(d));
    if (!departments.length) return res.status(403).json({error:'Geen toegelaten hulpdienst'});
    req.bpd={email,uid:verified.uid,role:String(entry.role),departments,discordId:String(entry.discordId||'')};
    next();
  } catch(e) {
    if(e.message?.includes('BPD_ACCESS_JSON')) return res.status(503).json({error:'Rechtenconfiguratie ongeldig'});
    return res.status(401).json({error:'Ongeldige of verlopen aanmelding'});
  }
}
async function queryLive(){
  if (!process.env.PERSONNEL_SPREADSHEET_ID || !process.env.ACTIVITY_SPREADSHEET_ID) throw new Error('Bronbestand-ID ontbreekt');
  const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const sheets=google.sheets({version:'v4',auth});
  const [p,a]=await Promise.all([
    sheets.spreadsheets.values.batchGet({spreadsheetId:process.env.PERSONNEL_SPREADSHEET_ID,ranges:Object.values(docs),valueRenderOption:'FORMATTED_VALUE'}),
    sheets.spreadsheets.values.get({spreadsheetId:process.env.ACTIVITY_SPREADSHEET_ID,range:'ACTIVITEITSCHECK!A2:Z300',valueRenderOption:'FORMATTED_VALUE'})
  ]);
  const personnel={};
  Object.keys(docs).forEach((name,i)=>personnel[name]=p.data.valueRanges?.[i]?.values||[]);
  const activityRows=a.data.values||[];
  const built=buildData(personnel,activityRows,allDepts);
  return built;
}
async function getSnapshot(){
  if(cache.data && Date.now()<cache.expires) return {data:cache.data,fetchedAt:cache.fetchedAt,stale:false};
  if(!cache.pending){
    cache.pending=queryLive().then(rows=>{cache.data=rows;cache.fetchedAt=new Date().toISOString();cache.expires=Date.now()+cacheMs;}).finally(()=>{cache.pending=null});
  }
  try {await cache.pending;return {data:cache.data,fetchedAt:cache.fetchedAt,stale:false};}
  catch(err){
    console.error('Sheets synchronisatie mislukt:',err.code||err.message||'fout');
    if(cache.data) return {data:cache.data,fetchedAt:cache.fetchedAt,stale:true};
    throw err;
  }
}
app.get('/api/client-config',(_req,res)=>{
  const {FIREBASE_PROJECT_ID,FIREBASE_API_KEY,FIREBASE_AUTH_DOMAIN}=process.env;
  res.json({enabled:Boolean(FIREBASE_PROJECT_ID&&FIREBASE_API_KEY&&FIREBASE_AUTH_DOMAIN),firebaseConfig:{projectId:FIREBASE_PROJECT_ID||'',apiKey:FIREBASE_API_KEY||'',authDomain:FIREBASE_AUTH_DOMAIN||''}});
});
app.get('/api/data',requireUser,async(req,res)=>{
  if(req.bpd.role==='basiskader')return res.status(403).json({error:'Basiskader heeft geen toegang tot het personeelsbeheer'});
  try{
    const snap=await getSnapshot();
    res.json({mode:'live-readonly',role:req.bpd.role,departments:req.bpd.departments,
      fetchedAt:snap.fetchedAt,stale:snap.stale,
      employees:snap.data.filter(p=>req.bpd.departments.includes(p.dept))});
  }catch(_err){res.status(503).json({error:'Google Sheets kon niet worden gelezen. Controleer serviceaccount en API-toegang.'});}
});
// Dossierlinks zijn gevoeliger dan gewone personeelsgegevens.
// Nooit meesturen met /api/data. Alleen rollen met expliciet beheerrecht mogen de link opvragen.
const dossierCache={expires:0,index:null,pending:null};
async function policeDossierIndex(){
  if(dossierCache.index && Date.now()<dossierCache.expires) return dossierCache.index;
  if(!dossierCache.pending) {
    dossierCache.pending=(async()=>{
      const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
      const sheets=google.sheets({version:'v4',auth});
      const resp=await sheets.spreadsheets.get({
        spreadsheetId:process.env.PERSONNEL_SPREADSHEET_ID,
        ranges:['PolitieInfo!P1:P658'],includeGridData:true,
        fields:'sheets(data(rowData(values(formattedValue,hyperlink))))'
      });
      const index=dossierLinksFromGrid(resp.data);
      dossierCache.index=index;
      dossierCache.expires=Date.now()+cacheMs;
      return index;
    })().finally(()=>{dossierCache.pending=null});
  }
  return dossierCache.pending;
}
app.get('/api/dossiers/:dept/:discordId',requireUser,async(req,res)=>{
  const {dept,discordId}=req.params;
  // Alleen expliciet geautoriseerde hogere rollen én dezelfde hulpdienst;
  // legacy Google Sheets heeft geen tabblad-specifieke toegangscontrole.
  if(!mayOpenLegacyDossierLink(req.bpd,dept))
    return res.status(403).json({error:'Geen bevoegdheid voor deze Google-dossierlink'});
  if(!/^\d{15,22}$/.test(discordId)) return res.status(400).json({error:'Ongeldige Discord ID'});
  if(dept!=='politie') return res.json({status:'niet_ingesteld'});
  try {
    const snap=await getSnapshot();
    if(!snap.data.some(p=>p.dept===dept && p.personId===discordId))
      return res.status(404).json({error:'Geen personeelslid gevonden'});
    const index=await policeDossierIndex();
    if(index.ambiguous.has(discordId)) return res.json({status:'controle_nodig'});
    const link=index.links.get(discordId);
    return res.json(link?{status:'gekoppeld',url:link}:{status:'niet_gekoppeld'});
  }catch(err){
    console.error('Dossierlink raadplegen mislukt:',err?.code||err?.message||'fout');
    return res.status(503).json({error:'Dossierlink momenteel niet beschikbaar'});
  }
});
installRegistrationRoutes(app,{requireUser,getSnapshot});
installManagementRoutes(app,{requireUser,getSnapshot});
installCallsignRoutes(app,{requireUser,getSnapshot,onPersonnelChanged:()=>{cache.expires=0;dossierCache.expires=0;}});
app.get('/api/health',(_req,res)=>res.json({status:'ok',integration:cache.fetchedAt?'cache-present':'not-yet-loaded'}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Niet gevonden'}));
app.listen(Number(process.env.PORT)||8080,()=>console.log('BelgiumPD op poort '+(process.env.PORT||8080)));
