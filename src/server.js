import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { discordConfig } from './discord-utils.js';
import { discordPortalAccess } from './discord-portal-access.js';
import { buildData } from './normalize.js';
import { dossierLinksFromGrid, mayOpenLegacyDossierLink } from './dossier-links.js';
import { ALLOWED_ROLES } from './registrations.js';
import { installRegistrationRoutes } from './registration-routes.js';
import { installCallsignRoutes } from './callsign-routes.js';
import { installManagementRoutes } from './management-routes.js';
import { installDiscordOAuth } from './discord-oauth.js';
import { installRoleRoutes } from './role-routes.js';
import { createTestPersonnel } from './test-personnel.js';
import { installLeaveRoutes } from './leave-routes.js';
import { installUserRoutes } from './user-routes.js';
import {installBoardAppointmentRoutes} from './board-appointment-routes.js';
import { USER_COLLECTION, approvedManagedEntry, verifiedDiscordIdentity } from './user-access.js';
import {reconcileLegacyPoliceOfficer} from './legacy-officer-reconciliation.js';
import {installPersonnelEditorRoutes} from './personnel-editor-routes.js';
import {installPersonnelActivityRoutes} from './personnel-activity-routes.js';
import {installSpecializationRoutes} from './specialization-routes.js';
import {PERSONNEL_SPECIALIZATIONS_COLLECTION,specialtyReadEnabled,applySpecialtyOverlays} from './specialization-policy.js';
import {installStaffDossierRoutes} from './staff-dossier-routes.js';
import {installDossierCenterRoutes} from './dossier-center-routes.js';
import {installTOBoardRoutes} from './to-board-routes.js';
import {publicDeploymentInfo} from './deployment-info.js';
import {PERSONNEL_EDITS_COLLECTION,mergePersonnelEdits} from './personnel-editor-policy.js';
import {CREATED_PERSONNEL_COLLECTION,asCreatedPersonnel,personnelDataEnabled} from './personnel-create.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.disable('x-powered-by');
app.use((_req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');next();});
// Applicant intake has been retired from this deployment. Keep historical
// Firestore data intact for audit; the retired public HTML cannot be served.
app.get(['/burgerdossier.html','/solliciteren.html','/sollicitatiebeheer.html'],(_req,res)=>
  res.status(410).type('text/plain').send('Deze pagina is buiten gebruik.'));
app.use(express.static(path.resolve(dir,'../public'),{index:'index.html',setHeaders:res=>res.set('Cache-Control','no-store')}));
app.use('/api/citizens',(_req,res)=>res.status(410).json({error:'Burgerdossiers zijn buiten gebruik'}));
app.use('/api/registrations',express.json({limit:'24kb',strict:true}));
app.use('/api/callsigns',express.json({limit:'12kb',strict:true}));
app.use('/api/management',express.json({limit:'24kb',strict:true}));
app.use('/api/roles',express.json({limit:'4kb',strict:true}));
app.use('/api/training',express.json({limit:'8kb',strict:true}));
app.use('/api/leave',express.json({limit:'4kb',strict:true}));
app.use('/api/users',express.json({limit:'4kb',strict:true}));
app.use('/api/board',express.json({limit:'4kb',strict:true}));
app.use('/api/personnel',express.json({limit:'4kb',strict:true}));
app.use('/api/staff-dossiers',express.json({limit:'4kb',strict:true}));
app.use('/api/to',express.json({limit:'24kb',strict:true}));
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
    // Google-noodtoegang blijft bestaan. Discord krijgt enkel de bestaande,
    // persoonlijk gemapte rechten uit de allowlist; geen rollen op basis van ID alleen.
    let email,entry,discordId;
    if(verified.email_verified && verified.firebase?.sign_in_provider==='google.com'){
      email=String(verified.email||'').toLowerCase();
      entry=accessList()[email];
      discordId=String(entry?.discordId||'');
      // Once a Firestore decision exists it also governs legacy Google sessions:
      // a blocked user may never fall back to their old Render allowlist entry.
      if(entry && /^\d{15,22}$/.test(discordId)){
        const managed=await getFirestore().collection(USER_COLLECTION).doc(discordId).get();
        if(managed.exists){
          entry=approvedManagedEntry(managed.data(),discordId);
          if(!entry)return res.status(403).json({error:'Deze portaaltoegang is geblokkeerd of niet goedgekeurd'});
        }
      }
    }else if(process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true'
      && verified.firebase?.sign_in_provider==='custom' && verified.bpdDiscord===true){
      const id=String(verified.uid||'').replace(/^discord:/,'');
      if(!/^\d{15,22}$/.test(id))return res.status(403).json({error:'Discord-identiteit ongeldig'});
      const member=(await getFirestore().collection('bpd_discord_auth').doc(id).get()).data();
      if(!verifiedDiscordIdentity(verified,member,process.env.DISCORD_GUILD_ID))
        return res.status(403).json({error:'Discord-verificatie verlopen. Meld je opnieuw aan met Discord.'});
      const managed=await getFirestore().collection(USER_COLLECTION).doc(id).get();
      if(managed.exists){
        entry=approvedManagedEntry(managed.data(),id);
        if(!entry)return res.status(403).json({error:'Je portaaltoegang is nog niet goedgekeurd of werd geblokkeerd. Open Gebruikersbeheer.'});
        discordId=id;
        email=Object.entries(accessList()).find(([,value])=>value?.discordId===id)?.[0]||'';
      }else{
        const mapped=discordPortalAccess(verified,accessList(),member,process.env.DISCORD_GUILD_ID);
        if(!mapped)return res.status(403).json({error:'Je Discord-account heeft nog geen goedgekeurde toegang. Open Gebruikersbeheer om toegang aan te vragen.'});
        ({email,entry,discordId}=mapped);
        // A historical cross-field mismatch cannot be blindly elevated.
        // Repair ONLY after independent, fresh Discord and personnel evidence.
        if(entry.role==='officierenkader' && entry.departmentRoles?.politie==='middenkader'){
          try{
            const snap=await getSnapshot();
            const corrected=reconcileLegacyPoliceOfficer(entry,discordId,member,
              snap.data,process.env.DISCORD_GUILD_ID);
            if(corrected)entry=corrected;
          }catch(err){
            console.error('Dienstrolcontrole niet beschikbaar:',err?.code||err?.message||'fout');
          }
        }
      }
    }else return res.status(403).json({error:'Gebruik de toegelaten Google- of Discord-aanmelding'});
    if (!entry || !Array.isArray(entry.departments) || !ALLOWED_ROLES.includes(entry.role)) return res.status(403).json({error:'Account is niet gemachtigd voor de koppeling'});
    const departments=entry.departments.filter(d=>allDepts.includes(d));
    if (!departments.length) return res.status(403).json({error:'Geen toegelaten hulpdienst'});
    // Een rol geldt alleen voor de gekoppelde hulpdienst; geen algemene verhoging.
    const rawDepartmentRoles =
      entry.departmentRoles && typeof entry.departmentRoles === 'object' && !Array.isArray(entry.departmentRoles)
        ? entry.departmentRoles
        : {};
    const departmentRoles = Object.fromEntries(
      Object.entries(rawDepartmentRoles).filter(([dept, role]) =>
        departments.includes(dept) && ALLOWED_ROLES.includes(role)
      )
    );
    req.bpd={email,uid:verified.uid,role:String(entry.role),departments,
      discordId,departmentRoles};
    next();
  } catch(e) {
    if(e.message?.includes('BPD_ACCESS_JSON')) return res.status(503).json({error:'Rechtenconfiguratie ongeldig'});
    return res.status(401).json({error:'Ongeldige of verlopen aanmelding'});
  }
}
async function queryLive(){

  if (process.env.BPD_TEST_FIXTURES === 'true') {
    if (process.env.FIREBASE_PROJECT_ID !== 'belgiepd-test') {
      throw new Error(
        'Fictieve testdata alleen toegestaan voor belgiepd-test'
      );
    }

    return createTestPersonnel();
  }
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
async function getSourceSnapshot(forceRefresh=false){
  if(!forceRefresh&&cache.data && Date.now()<cache.expires) return {data:cache.data,fetchedAt:cache.fetchedAt,stale:false};
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
// Only read Firestore edits into shared personnel snapshots after the pilot is approved.
// Read-only Sheets remain intact for rollback and comparison.
async function getSnapshot({forceRefresh=false}={}){
  const base=await getSourceSnapshot(forceRefresh);
  const on=personnelDataEnabled(process.env);
  const [created,edits,specialties]=await Promise.all([
    on?getFirestore().collection(CREATED_PERSONNEL_COLLECTION).limit(500).get():null,
    process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true'
      ?getFirestore().collection(PERSONNEL_EDITS_COLLECTION).limit(400).get():null,
    specialtyReadEnabled(process.env)
      ?getFirestore().collection(PERSONNEL_SPECIALIZATIONS_COLLECTION).limit(600).get():null
  ]);
  if(created?.size===500||edits?.size===400||specialties?.size===600)throw Error('Te veel personeelsrecords; migratiecontrole nodig');
  const added=(created?.docs||[]).map(d=>asCreatedPersonnel(d.data())).filter(Boolean);
  // Never silently override or duplicate an original service+Discord ID.
  const keys=new Set(base.data.map(p=>p.dept+':'+p.personId));
  const extra=added.filter(p=>!keys.has(p.dept+':'+p.personId));
  const combined=base.data.concat(extra);
  const personnel=edits?mergePersonnelEdits(combined,edits.docs.map(d=>d.data())):combined;
  return {...base,data:specialties?applySpecialtyOverlays(personnel,specialties.docs):personnel};
}
app.get('/api/client-config',(_req,res)=>{
  const {FIREBASE_PROJECT_ID,FIREBASE_API_KEY,FIREBASE_AUTH_DOMAIN}=process.env;
  res.json({enabled:Boolean(FIREBASE_PROJECT_ID&&FIREBASE_API_KEY&&FIREBASE_AUTH_DOMAIN),discordPortalLoginReady:process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true'&&discordConfig(process.env).ready,firebaseConfig:{projectId:FIREBASE_PROJECT_ID||'',apiKey:FIREBASE_API_KEY||'',authDomain:FIREBASE_AUTH_DOMAIN||''}});
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
installLeaveRoutes(app,{requireUser,getSnapshot,accessList});
installUserRoutes(app,{requireUser,accessList});
installBoardAppointmentRoutes(app,{requireUser});
// More-specific activity endpoints MUST precede /api/personnel/:dept/:discordId.
// That broad POST edit route otherwise intercepts retrospective audit submissions.
installPersonnelActivityRoutes(app,{requireUser,getSnapshot});
installPersonnelEditorRoutes(app,{requireUser,getSnapshot});
installSpecializationRoutes(app,{requireUser,getSnapshot});
installStaffDossierRoutes(app,{requireUser,getSnapshot});
installDossierCenterRoutes(app,{requireUser,getSnapshot});
installTOBoardRoutes(app,{requireUser});
app.get('/api/health',(_req,res)=>res.json({
  status:'ok',integration:cache.fetchedAt?'cache-present':'not-yet-loaded',
  deployment:publicDeploymentInfo()
}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Niet gevonden'}));
app.listen(Number(process.env.PORT)||8080,()=>console.log('BelgiumPD op poort '+(process.env.PORT||8080)));
