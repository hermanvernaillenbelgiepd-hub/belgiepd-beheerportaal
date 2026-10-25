import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {firebaseDiagnostic} from './firebase-diagnostics.js';
import { discordConfig } from './discord-utils.js';
import { discordPortalAccess } from './discord-portal-access.js';
import {ensureVerifiedMiddleAccess,stillEligibleAutoCadre,AUTO_CADRE_SOURCE} from './verified-mid-cadre-access.js';
import { planPersonnelMigration } from './personnel-migration.js';
import { dossierLinksFromGrid, mayOpenLegacyDossierLink } from './dossier-links.js';
import { ALLOWED_ROLES } from './registrations.js';
import { installRegistrationRoutes } from './registration-routes.js';
import {installBasicObservationRoutes} from './basic-observation-routes.js';
import { installCallsignRoutes } from './callsign-routes.js';
import {installCallsignBotRoutes} from './callsign-bot-routes.js';
import {installCallsignSelfServiceRoutes} from './callsign-selfservice-routes.js';
import {installMemberDashboardRoutes} from './member-dashboard-routes.js';
import {canSeeDashboardManagement,canSeeAdvancedDashboard} from './dashboard-admin-policy.js';
import { installManagementRoutes } from './management-routes.js';
import { installDiscordOAuth } from './discord-oauth.js';
import {installDiscordPersonalProfileRoutes} from './discord-personal-profile.js';
import { installRoleRoutes } from './role-routes.js';
import {installTrainingRequestRoutes} from './training-request-routes.js';
import { createTestPersonnel } from './test-personnel.js';
import { installLeaveRoutes } from './leave-routes.js';
import { installUserRoutes } from './user-routes.js';
import {installManualRoleRoutes} from './manual-role-routes.js';
import {installBoardAppointmentRoutes} from './board-appointment-routes.js';
import { USER_COLLECTION, approvedManagedEntry, verifiedDiscordIdentity } from './user-access.js';
import {reconcileLegacyPoliceOfficer} from './legacy-officer-reconciliation.js';
import {eligibleForTechnicalProfile,verifiedPoliceRank,technicalCookieIsValid,technicalActor} from './portal-profile-mode.js';
import {installPersonnelEditorRoutes} from './personnel-editor-routes.js';
import {installPersonnelActivityRoutes} from './personnel-activity-routes.js';
import {installSpecializationRoutes} from './specialization-routes.js';
import {installFunctionChangeRoutes} from './function-change-routes.js';
import {installReceivedRegistrationRoutes} from './received-registration-routes.js';
import {PERSONNEL_SPECIALIZATIONS_COLLECTION,specialtyReadEnabled,applySpecialtyOverlays} from './specialization-policy.js';
import {installStaffDossierRoutes} from './staff-dossier-routes.js';
import {installDossierRetirementRoutes} from './dossier-retirement-routes.js';
import {installDossierCenterRoutes} from './dossier-center-routes.js';
import {installFireDossierRoutes} from './fire-dossier-routes.js';
import {installDossierGrantRoutes} from './dossier-grant-routes.js';
import {applyDossierGrants,DOSSIER_GRANT_COLLECTION,dossierGrantKey,DOSSIER_DEPTS,
  verifyBoardDiscordRole} from './dossier-grants.js';
import {activeBoardAppointment} from './board-appointment-policy.js';
import {deriveServiceDossierDepartments,verifiedFireZoneChief,verifiedServiceReportRoles} from './service-dossier-access.js';
import {verifiedFireRoles,fireActorClass,FIRE_ROLES} from './fire-dossier-policy.js';
import {installTOBoardRoutes,createFirestoreTOStore} from './to-board-routes.js';
import {installTORadioRoutes} from './to-radio-routes.js';
import {publicDeploymentInfo} from './deployment-info.js';
import {PERSONNEL_EDITS_COLLECTION,mergePersonnelEdits,canReadPersonnelSubject,isCorpsLeadershipPersonnel} from './personnel-editor-policy.js';
import {isPolice9xx,verifiedOfficerCadre} from './verified-police-cadre.js';
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
app.use('/api/callsigns',express.json({limit:'12kb',strict:true,
  verify:(req,_res,raw)=>{req.bpdRawBody=Buffer.from(raw)}}));
app.use('/api/management',express.json({limit:'24kb',strict:true}));
app.use('/api/roles',express.json({limit:'4kb',strict:true}));
app.use('/api/training',express.json({limit:'8kb',strict:true}));
app.use('/api/training-requests',express.json({limit:'4kb',strict:true}));
app.use('/api/leave',express.json({limit:'4kb',strict:true}));
app.use('/api/users',express.json({limit:'4kb',strict:true}));
app.use('/api/dossier-grants',express.json({limit:'4kb',strict:true}));
app.use('/api/fire-dossiers',express.json({limit:'6kb',strict:true}));
app.use('/api/board',express.json({limit:'4kb',strict:true}));
app.use('/api/personnel',express.json({limit:'4kb',strict:true}));
app.use('/api/staff-dossiers',express.json({limit:'4kb',strict:true}));
// Dossier intrekkingen verwachten uitsluitend een gecontroleerde JSON-motivering.
app.use('/api/dossier-retirement',express.json({limit:'4kb',strict:true}));
// Parse TO commands before installing TO routes, retaining strict size limits.
app.use('/api/to',express.json({limit:'24kb',strict:true}));
app.locals.discordJsonParser=express.json({limit:'2kb',strict:true});
installDiscordOAuth(app);
installRoleRoutes(app,{getSnapshot});
// The live personnel view remains sourced from Sheets during the transition.
 // Including citizens in the snapshot does NOT re-enable retired citizen dossiers.
const allDepts=['politie','brandweer','ambulance','depannage','burger'];
const docs={
  politie:'POLITIE!A3:R300', ambulance:'AMBULANCE!A3:K150',
  brandweer:'BRANDWEER!A3:N150', depannage:'DEPANNAGE!A3:H120',
  burger:'BURGERS!A3:H180'
};
const auxiliaryPersonnelRanges={brandweerInfo:'BrandweerInfo!A1:M150'};
const cache={expires:0,data:null,fetchedAt:null,pending:null};
const cacheMs=Math.max(1,Math.min(60,Number(process.env.SYNC_CACHE_MINUTES)||15))*60*1000;
function accessList(){
  try {
    const parsed=JSON.parse(process.env.BPD_ACCESS_JSON||'{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') return {};
    return parsed;
  } catch {throw new Error('BPD_ACCESS_JSON bevat ongeldige JSON.');}
}
// Reduce Firestore reads across the separate 5-second board and radio polls.
// Authorization documents are cached for at most 15 seconds (never negative-
// cached on failure); Firebase ID tokens are still verified on every request.
// Security tradeoff: revocations may take up to 15 seconds to take effect.
// Do not cache sensitive role or approval changes longer than this.
const authDocCache=new Map();
async function cachedAuthDoc(collection,id){
  const key=collection+':'+id,now=Date.now(),old=authDocCache.get(key);
  if(old?.snapshot&&old.expires>now)return old.snapshot;
  if(old?.pending)return old.pending;
  const pending=getFirestore().collection(collection).doc(id).get();
  authDocCache.set(key,{pending});
  try{
    const snapshot=await pending;
    if(authDocCache.size>750)authDocCache.clear();
    authDocCache.set(key,{snapshot,expires:Date.now()+15000});
    return snapshot;
  }catch(error){authDocCache.delete(key);throw error}
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
    let email,entry,discordId,discordMember=null,manualRoleRecovery=null;
    if(verified.email_verified && verified.firebase?.sign_in_provider==='google.com'){
      email=String(verified.email||'').toLowerCase();
      entry=accessList()[email];
      discordId=String(entry?.discordId||'');
      // Once a Firestore decision exists it also governs legacy Google sessions:
      // a blocked user may never fall back to their old Render allowlist entry.
      if(entry && /^\d{15,22}$/.test(discordId)){
        const managed=await cachedAuthDoc(USER_COLLECTION,discordId);
        if(managed.exists){
          if(managed.get('approvalSource')===AUTO_CADRE_SOURCE)
            return res.status(403).json({error:'Automatisch goedgekeurde kaderrechten vereisen je eigen Discord-login'});
          entry=approvedManagedEntry(managed.data(),discordId);
          if(!entry)return res.status(403).json({error:'Deze portaaltoegang is geblokkeerd of niet goedgekeurd'});
        }
      }
    }else if(process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true'
      && verified.firebase?.sign_in_provider==='custom' && verified.bpdDiscord===true){
      const id=String(verified.uid||'').replace(/^discord:/,'');
      if(!/^\d{15,22}$/.test(id))return res.status(403).json({error:'Discord-identiteit ongeldig'});
      const member=(await cachedAuthDoc('bpd_discord_auth',id)).data();
      discordMember=member;
      if(!verifiedDiscordIdentity(verified,member,process.env.DISCORD_GUILD_ID))
        return res.status(403).json({error:'Discord-verificatie verlopen. Meld je opnieuw aan met Discord.'});
      const store=getFirestore(),ref=store.collection(USER_COLLECTION).doc(id);
      let managed=await cachedAuthDoc(USER_COLLECTION,id);
      if(!managed.exists||managed.get('status')==='pending'){
        const provisioned=await ensureVerifiedMiddleAccess(store,verified,member,
          process.env.DISCORD_GUILD_ID,process.env);
        if(provisioned){authDocCache.delete(USER_COLLECTION+':'+id);managed=await cachedAuthDoc(USER_COLLECTION,id);}
      }
      if(managed.exists){
        manualRoleRecovery=managed.data()?.manualRoleRecovery||null;
        entry=approvedManagedEntry(managed.data(),id);
        if(!entry)return res.status(403).json({error:'Je portaaltoegang is nog niet goedgekeurd of werd geblokkeerd. Open Gebruikersbeheer.'});
        if(!stillEligibleAutoCadre(verified,member,process.env.DISCORD_GUILD_ID,
          process.env,managed.data()))
          return res.status(403).json({error:'Je automatische Middenkader-toegang vereist een nieuwe Discord-verificatie. Vernieuw je rollen in Mijn Discord.'});
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
    const actor={email,uid:verified.uid,role:String(entry.role),departments,
      discordId,departmentRoles};
    // Alleen een apart goedgekeurde, geauditeerde manuele Korpsleiding-machtiging
    // kan bij ontbrekende Discord-rolverificatie de beschermde dossiers openen.
    actor.manualCorpsApproved=Boolean(manualRoleRecovery?.dept==='politie'&&
      manualRoleRecovery?.role==='korpsleiding'&&
      actor.role==='korpsleiding'&&departmentRoles.politie==='korpsleiding'&&
      typeof manualRoleRecovery.approvedBy==='string'&&
      manualRoleRecovery.approvedBy!==actor.uid&&verified.uid==='discord:'+discordId);
    actor.manualFireRole=(manualRoleRecovery?.dept==='brandweer'&&
      verified.uid==='discord:'+discordId&&
      actor.departments.includes('brandweer')&&
      actor.departmentRoles.brandweer===manualRoleRecovery.role&&
      typeof manualRoleRecovery.approvedBy==='string'&&
      manualRoleRecovery.approvedBy!==actor.uid)
        ?({middenkader:'middle',officierenkader:'leadership',
          korpsleiding:'zone'}[manualRoleRecovery.role]||null):null;
    const canSwitch=eligibleForTechnicalProfile(verified,actor,discordMember,process.env);
    actor.profileTechnicalAvailable=canSwitch;
    actor.discordPoliceRank=verifiedPoliceRank(discordMember,process.env.DISCORD_GUILD_ID);
    req.bpd=canSwitch&&technicalCookieIsValid(req.headers.cookie,verified.uid,discordId,
      process.env.BPD_PORTAL_PROFILE_SIGNING_KEY)?technicalActor(actor):actor;
    next();
  } catch(e) {
    if(e.message?.includes('BPD_ACCESS_JSON'))
      return res.status(503).json({error:'Rechtenconfiguratie ongeldig'});
    // Only log a short, recognized Firebase/backend error code, never
    // bearer tokens, IDs, e.message, or private Firestore contents.
    const rawCode=typeof e?.code==='string'?e.code:'';
    const diagnostic=firebaseDiagnostic(e);
    console.warn('Portaal-aanmeldcontrole:',diagnostic.code,diagnostic.category);
    const infra=diagnostic.category!=='unexpected_error'||
      diagnostic.code.startsWith('app/')||
      diagnostic.code==='auth/invalid-credential';
    return res.status(infra?503:401).json({error:
      diagnostic.category==='firestore_quota_exhausted'?
        'Firebase Firestore-gebruikslimiet bereikt. De server kan de toegang momenteel niet bevestigen. Controleer Firestore Usage en quota.':
      infra?'De server kan de aanmelding tijdelijk niet controleren. Probeer opnieuw.':
      'Ongeldige of verlopen aanmelding. Meld opnieuw aan met Discord of Google.'});
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
    sheets.spreadsheets.values.batchGet({spreadsheetId:process.env.PERSONNEL_SPREADSHEET_ID,
      ranges:[...Object.values(docs),...Object.values(auxiliaryPersonnelRanges)],
      valueRenderOption:'FORMATTED_VALUE'}),
    sheets.spreadsheets.values.get({spreadsheetId:process.env.ACTIVITY_SPREADSHEET_ID,range:'ACTIVITEITSCHECK!A2:Z300',valueRenderOption:'FORMATTED_VALUE'})
  ]);
  const personnel={};
  Object.keys(docs).forEach((name,i)=>personnel[name]=p.data.valueRanges?.[i]?.values||[]);
  const activityRows=a.data.values||[];
  // The migration planner is read-only. It links BrandweerInfo names and
  // old-name aliases to genuine Discord IDs, and rejects ambiguous/duplicate
  // entries instead of attaching somebody else's dossier. The original Sheet
  // and existing Firestore audit/history are never rewritten.
  const brandweerInfo=p.data.valueRanges?.[Object.keys(docs).length]?.values||[];
  const plan=planPersonnelMigration(personnel,activityRows,null,{brandweerInfo});
  if(!plan.records.length)throw Error('Personeelsbron bevat geen geldige dossiers');
  if(plan.duplicates.length||plan.unmatched.length)
    console.warn('Personeelsynchronisatie vraagt broncontrole:',JSON.stringify({
      unmatched:plan.unmatched.length,duplicates:plan.duplicates.length,
      byDepartment:Object.fromEntries(Object.entries(plan.statistics).map(([dept,x])=>
        [dept,{linked:x.records,unmatched:x.unmatched,duplicates:x.duplicates}]))
    }));
  // Only normalized, validated fields reach authenticated portal endpoints.
  // Never expose raw sourceCells, auxiliary aliases, or migration notes.
  return plan.records.map(row=>({...row.personnel,source:'google-sheets',
    sourceRow:row.sourceRow}));
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
    const subject=snap.data.filter(p=>p.dept===dept&&p.personId===discordId);
    if(subject.length!==1)
      return res.status(404).json({error:'Geen eenduidig personeelslid gevonden'});
    const verifiedTechnical=req.bpd.portalTechnicalMode===true&&
      req.bpd.profileTechnicalAvailable===true&&
      req.bpd.uid==='discord:'+req.bpd.discordId;
    // Even a legacy Google dossier link is sensitive. Never bypass the 9xx
    // role check through this older route, whether by direct URL or via UI.
    if(isPolice9xx(subject[0].call)&&!verifiedTechnical){
      const member=await cachedAuthDoc('bpd_discord_auth',discordId);
      const subjectRole=member.exists?verifiedOfficerCadre(member.data(),
        process.env.DISCORD_GUILD_ID,Date.now(),15*60*1000):null;
      const genuineChief=req.bpd.uid==='discord:'+req.bpd.discordId&&
        req.bpd.role==='korpsleiding'&&req.bpd.departmentRoles?.politie==='korpsleiding'&&
        req.bpd.discordPoliceRank==='korpsleiding';
      if(subjectRole!=='Officierenkader'&&!genuineChief)
        return res.status(403).json({error:'Dit dossier is afgeschermd'});
    }else if(isCorpsLeadershipPersonnel(subject[0])&&!verifiedTechnical){
      if(req.bpd.uid!=='discord:'+req.bpd.discordId||
        req.bpd.role!=='korpsleiding'||req.bpd.discordPoliceRank!=='korpsleiding')
        return res.status(403).json({error:'Dit dossier is afgeschermd'});
    }
    const index=await policeDossierIndex();
    if(index.ambiguous.has(discordId)) return res.json({status:'controle_nodig'});
    const link=index.links.get(discordId);
    return res.json(link?{status:'gekoppeld',url:link}:{status:'niet_gekoppeld'});
  }catch(err){
    console.error('Dossierlink raadplegen mislukt:',err?.code||err?.message||'fout');
    return res.status(503).json({error:'Dossierlink momenteel niet beschikbaar'});
  }
});
// Sensitive dossier scopes are determined ONLY on the server after standard
// portal approval. Never grant them from client-supplied rank or radio name.
const requireDossierUser=(req,res,next)=>requireUser(req,res,async()=>{
  try{
    const id=req.bpd?.discordId;
    const valid=/^\d{15,22}$/.test(String(id||''));
    const db=getFirestore();
    const [snapshot,member,appointment,grants,tester]=await Promise.all([
      getSnapshot(),
      valid?db.collection('bpd_discord_auth').doc(id).get():Promise.resolve(null),
      valid?db.collection('bpd_board_appointments').doc(id).get():Promise.resolve(null),
      valid?Promise.all(DOSSIER_DEPTS.map(d=>db.collection(DOSSIER_GRANT_COLLECTION)
        .doc(dossierGrantKey(d,id)).get())):Promise.resolve([]),
      valid&&process.env.FIREBASE_PROJECT_ID==='belgiepd-test'
        ?db.collection('bpd_dossier_testers').doc(id).get():Promise.resolve(null)
    ]);
    const roster=snapshot.stale?[]:snapshot.data;
    // Server-only, freshly checked ZONE leadership, scoped exclusively to fire.
    req.bpd.fireZoneChief=verifiedFireZoneChief(req.bpd,roster,
      member?.exists?member.data():null,process.env.DISCORD_GUILD_ID)||
      (req.bpd.manualFireRole==='zone');
    req.bpd.fireAccessLevel=fireActorClass(req.bpd,
      verifiedFireRoles(member?.data(),process.env.DISCORD_GUILD_ID));
    // This is evidence of an actual medical/AWV Discord leadership role.
    // Police officer status or a generic portal cadre never grants access.
    req.bpd.reportServiceRoles=verifiedServiceReportRoles(req.bpd,
      member?.exists?member.data():null,process.env.DISCORD_GUILD_ID);
    const original=deriveServiceDossierDepartments(req.bpd,
      roster,member?.exists?member.data():null,
      appointment?.exists?appointment.data():null,process.env.DISCORD_GUILD_ID);
    const native=deriveServiceDossierDepartments(req.bpd,
      roster,member?.exists?member.data():null,
      null,process.env.DISCORD_GUILD_ID,Date.now(),false);
    const scope=applyDossierGrants(req.bpd,original,
      grants.filter(d=>d.exists).map(d=>d.data()),tester?.exists?tester.data():null);
    req.bpd.boardPersonnelAdmin=Boolean(valid&&req.bpd.uid==='discord:'+id&&(
      verifyBoardDiscordRole(member?.exists?member.data():null,process.env.DISCORD_GUILD_ID)||
      activeBoardAppointment(appointment?.exists?appointment.data():null)
    ));
    req.bpd.dossierNativeDepartments=native;
    req.bpd.dossierAllowedDepartments=scope.departments;
    req.bpd.dossierManageDepartments=scope.manageDepartments;
    req.bpd.dossierFullDepartments=scope.fullDepartments;
    req.bpd.dossierTester=scope.tester;
    // A fresh, guild-bound role snapshot for each fire subject. A missing role
    // snapshot can never be treated as ordinary Brandweer membership.
    req.bpd.fireSubjectRoleSets=new Map();
    const fireEndpoint=scope.departments.includes('brandweer')&&
      (req.path==='/api/dossiercentrum/overview'||
       req.path.startsWith('/api/fire-dossiers')||
       req.params?.dept==='brandweer'||req.query?.dept==='brandweer'||
       req.body?.dept==='brandweer');
    if(fireEndpoint&&!snapshot.stale){
      const fireIds=[...new Set(roster.filter(p=>p.dept==='brandweer'&&
        /^[0-9]{15,22}$/.test(String(p.personId||''))).map(p=>p.personId))];
      for(let i=0;i<fireIds.length;i+=30){
        const group=fireIds.slice(i,i+30);
        const [roles,accounts]=await Promise.all([
          Promise.all(group.map(fireId=>cachedAuthDoc('bpd_discord_auth',fireId))),
          Promise.all(group.map(fireId=>cachedAuthDoc(USER_COLLECTION,fireId)))
        ]);
        group.forEach((fireId,index)=>{
          const proven=verifiedFireRoles(roles[index].data(),process.env.DISCORD_GUILD_ID);
          const account=accounts[index].exists?
            approvedManagedEntry(accounts[index].data(),fireId):null;
          // An approved higher staff classification also protects the target
          // when their Discord grade failed to synchronize.
          const grade=account?.departmentRoles?.brandweer;
          if(proven&&['middenkader','officierenkader','korpsleiding'].includes(grade))
            proven.add(grade==='middenkader'?FIRE_ROLES.middle:FIRE_ROLES.leadership);
          req.bpd.fireSubjectRoleSets.set(fireId,proven);
        });
      }
    }
    // Trust a 9xx subject's verified Discord role, never the shared callsign
    // or a possibly historical Sheets rank. Missing/stale guild evidence
    // means protected dossier, while the visible staff roster remains intact.
    req.bpd.verifiedPoliceSubjectRoles=Object.create(null);
    if(scope.departments.includes('politie')&&!snapshot.stale){
      const ids=[...new Set(roster.filter(p=>p.dept==='politie'&&
        isPolice9xx(p.call)&&/^\d{15,22}$/.test(String(p.personId||'')))
        .map(p=>p.personId))];
      for(let i=0;i<ids.length;i+=25){
        const group=ids.slice(i,i+25);
        const found=await Promise.all(group.map(subjectId=>
          cachedAuthDoc('bpd_discord_auth',subjectId)));
        for(let j=0;j<group.length;j++){
          const label=found[j]?.exists?
            verifiedOfficerCadre(found[j].data(),process.env.DISCORD_GUILD_ID,
              Date.now(),15*60*1000):null;
          if(label)req.bpd.verifiedPoliceSubjectRoles[group[j]]=label;
        }
      }
    }
    // Brandweer heeft zijn eigen, beperkt gegevensmodel. Andere oude dossier-
    // endpoints mogen vertrouwelijke leidinggevende registraties nooit vrijgeven
    // aan Brandweer Middenkader of Brandweerleiding.
    const restrictedFire=scope.departments.includes('brandweer')&&
      req.bpd.boardPersonnelAdmin!==true&&req.bpd.fireZoneChief!==true&&
      req.bpd.portalTechnicalMode!==true;
    if(restrictedFire&&new RegExp('^/api/(personnel|staff-dossiers|registrations|management|specializations|function-changes)(/|$)').test(req.path)){
      const dept=req.params?.dept||req.query?.dept||req.body?.dept;
      if(!dept||dept==='brandweer')
        return res.status(403).json({error:'Gebruik het afgeschermde Brandweerdossier in het Dossiercentrum'});
    }
    // Beveilig elk rechtstreeks geopend individueel dossier, ook met een
    // bekend Discord-ID. Een verborgen rij in de browser is geen toegangscontrole.
    const subjectPath=/^\/api\/(?:personnel\/|staff-dossiers\/|training\/|registrations\/entries(?:\/|$)|management\/cases(?:\/|$)|dossiercentrum\/)/.test(req.path);
    const subjectDept=req.params?.dept||req.query?.dept||req.body?.dept;
    const subjectId=req.params?.discordId||req.query?.discordId||req.body?.discordId;
    if(subjectPath&&subjectDept&&/^\d{15,22}$/.test(String(subjectId||''))){
      if(snapshot.stale)
        return res.status(503).json({error:'De personeelsbron moet actueel zijn om een beschermd dossier te openen'});
      const target=snapshot.data.filter(p=>p.dept===subjectDept&&p.personId===subjectId);
      if(target.length!==1)
        return res.status(404).json({error:'Geen eenduidige personeelsfiche gevonden'});
      if(!canReadPersonnelSubject(req.bpd,target[0]))
        return res.status(403).json({error:'Dit personeelsdossier is afgeschermd voor jouw kaderrol'});
    }
    next();
  }catch(e){
    console.error('Dossierrechten konden niet geverifieerd worden:',e?.code||e?.message||'onbekend');
    res.status(503).json({error:'De dossierrechten kunnen momenteel niet gecontroleerd worden'});
  }
});
installRegistrationRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installBasicObservationRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installManagementRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installCallsignRoutes(app,{requireUser,getSnapshot,onPersonnelChanged:()=>{cache.expires=0;dossierCache.expires=0;}});
installCallsignBotRoutes(app);
installCallsignSelfServiceRoutes(app,{getSnapshot});
installMemberDashboardRoutes(app,{getSnapshot,accessList});
installTrainingRequestRoutes(app,{getSnapshot,accessList});
installLeaveRoutes(app,{requireUser,requireDossierUser,getSnapshot,accessList});
installUserRoutes(app,{requireUser,accessList});
installManualRoleRoutes(app,{requireUser});
// Dashboard visibility uses server-confirmed operational or board authorisation.
app.get('/api/dashboard/admin-visibility',requireDossierUser,(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({visible:canSeeDashboardManagement(req.bpd),
    showAdvancedDashboard:canSeeAdvancedDashboard(req.bpd)});
});
installDossierGrantRoutes(app,{requireUser:requireDossierUser,accessList});
installBoardAppointmentRoutes(app,{requireUser});
installDiscordPersonalProfileRoutes(app,{getSnapshot});
// More-specific activity endpoints MUST precede /api/personnel/:dept/:discordId.
// That broad POST edit route otherwise intercepts retrospective audit submissions.
installPersonnelActivityRoutes(app,{requireUser,getSnapshot});
installPersonnelEditorRoutes(app,{requireUser,requireDossierUser,getSnapshot});
installSpecializationRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installFunctionChangeRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installReceivedRegistrationRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installStaffDossierRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installDossierRetirementRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installDossierCenterRoutes(app,{requireUser:requireDossierUser,getSnapshot});
installFireDossierRoutes(app,{requireUser:requireDossierUser,getSnapshot});
// TO duty board uses MAIN Firestore data and the existing authenticated actor.
const getVerifiedTemporaryTORequest=async discordId=>{
  if(!/^\d{15,22}$/.test(discordId))return null;
  const snapshot=await getFirestore().collection('bpd_callsign_requests').doc(discordId).get();
  return snapshot.exists?{...snapshot.data(),discordId}:null;
};
// TO-specific Firebase grants, retrieved only AFTER normal portal login.
// Revoked records override the limited legacy ENV TO allowlist.
const requireTOUser=(req,res,next)=>requireUser(req,res,async()=>{
  try{
    const id=req.bpd?.discordId;
    if(req.bpd?.uid==='discord:'+id&&/^\d{15,22}$/.test(String(id))){
      const snap=await cachedAuthDoc('bpd_to_access',id);
      if(snap.exists){
        const grant=snap.data();
        req.bpd.toAccessLevel=grant?.status==='active'&&['read','operate'].includes(grant?.level)?grant.level:'revoked';
      }
    }
    next();
  }catch(error){console.error('TO-machtigingen tijdelijk niet beschikbaar');
    res.status(503).json({error:'TO-toegangscontrole tijdelijk niet beschikbaar'});}
});
const toBoardStore=createFirestoreTOStore();
installTOBoardRoutes(app,{requireUser:requireTOUser,store:toBoardStore,getSnapshot,getTemporaryRequest:getVerifiedTemporaryTORequest});
installTORadioRoutes(app,{requireUser:requireTOUser,store:toBoardStore});
app.get('/api/health',(_req,res)=>res.json({
  status:'ok',integration:cache.fetchedAt?'cache-present':'not-yet-loaded',
  deployment:publicDeploymentInfo()
}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Niet gevonden'}));
// Non-sensitive read-only health probe: one impossible document ID,
// performed at startup so missing Firestore configuration is diagnosable
// even before a member attempts login. No new user data is ever written.
async function probeDiscordFirestore(){
  try{
    if(!getApps().length)
      initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
    const check=getFirestore().collection('bpd_discord_auth').doc('000000000000000000').get();
    const timeout=new Promise((_,reject)=>setTimeout(()=>
      reject(Object.assign(new Error('Firestore health timeout'),{code:4})),12000));
    await Promise.race([check,timeout]);
    console.info('Discord Firebase-databasecontrole: verbonden');
  }catch(error){
    const diagnostic=firebaseDiagnostic(error);
    console.warn('Discord Firebase-databasecontrole:',diagnostic.code,diagnostic.category);
  }
}
app.listen(Number(process.env.PORT)||8080,()=>{
  console.log('BelgiumPD op poort '+(process.env.PORT||8080));
  void probeDiscordFirestore();
});
