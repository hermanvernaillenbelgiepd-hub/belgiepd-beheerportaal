import { getApps,initializeApp,applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore,FieldValue } from 'firebase-admin/firestore';
import { discordPortalAccess } from './discord-portal-access.js';
import {approvedManagedEntry,verifiedDiscordIdentity,USER_COLLECTION} from './user-access.js';
import {activeDossierGrant,DOSSIER_GRANT_COLLECTION,dossierGrantKey,DOSSIER_DEPTS,verifyBoardDiscordRole} from './dossier-grants.js';
import {BOARD_COLLECTION,activeBoardAppointment} from './board-appointment-policy.js';
import {eligibleForTechnicalProfile,technicalCookieIsValid} from './portal-profile-mode.js';
import { isDiscordId } from './discord-utils.js';
import { ROLE_CATALOG,roleSummary,SERVICE_DEPTS } from './role-catalog.js';
import { basePermissions,effectivePermissions,validateOverride,canAdministerRoles,canLogTraining,canReviewTraining,visibleTrainingPermissions,DELEGATABLE_PERMISSIONS } from './permissions-utils.js';
import { mayMaintainTraining,isArchivedTraining,validateMaintenanceReason,isRecordId,requiresReReview } from './training-maintenance.js';
import {roleForDepartment} from './leave-policy.js';
import {isCorpsLeadershipPersonnel} from './personnel-editor-policy.js';
import {isPolice9xx,verifiedOfficerCadre} from './verified-police-cadre.js';
import {verifiedFireRoles,fireSubjectClass} from './fire-dossier-policy.js';

const asText=(v,n=300)=>typeof v==='string' ? v.trim().slice(0,n):'';
const db=()=>getFirestore();
const iso=v=>v?.toDate?.()?.toISOString()||null;
function firebaseAuth(){if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});return getAuth()}
function googleAccessList(){
  try{const o=JSON.parse(process.env.BPD_ACCESS_JSON||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}
  catch{return {}}
}
async function resolveActor(req,res,next){
  const token=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
  if(!token)return res.status(401).json({error:'Aanmelding vereist'});
  try{
    const decoded=await firebaseAuth().verifyIdToken(token);
    let bpd=null,discordId='';
    if(decoded.firebase?.sign_in_provider==='google.com' && decoded.email_verified){
      const e=googleAccessList()[String(decoded.email||'').toLowerCase()];
      if(!e||!Array.isArray(e.departments)||!['basiskader','middenkader','officierenkader','korpsleiding','beheerder'].includes(e.role))return res.status(403).json({error:'Google-account niet gemachtigd'});
      bpd={provider:'google',role:e.role,departments:e.departments.filter(d=>SERVICE_DEPTS.includes(d)),
        departmentRoles:e.departmentRoles||{},uid:decoded.uid,email:decoded.email,
        discordId:String(e.discordId||''),trustedStaff:true};
      discordId=bpd.discordId;
    }else if(decoded.firebase?.sign_in_provider==='custom' && decoded.bpdDiscord===true && /^discord:\d{15,22}$/.test(decoded.uid) && decoded.bpdGuildId===process.env.DISCORD_GUILD_ID){
      discordId=decoded.uid.slice(8);
      bpd={provider:'discord',role:null,departments:[],uid:decoded.uid,discordId};
    }else return res.status(403).json({error:'Geen toegelaten aanmeldmethode'});
    const snap=isDiscordId(discordId)?await db().collection('bpd_discord_auth').doc(discordId).get():null;
    const member=snap?.exists?snap.data():null;
    if(bpd.provider==='discord' && process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true'){
      const allowed=discordPortalAccess(decoded,googleAccessList(),member,process.env.DISCORD_GUILD_ID);
      if(allowed && Array.isArray(allowed.entry.departments)
        && ['basiskader','middenkader','officierenkader','korpsleiding','beheerder'].includes(allowed.entry.role)){
        bpd={...bpd,role:allowed.entry.role,
          departments:allowed.entry.departments.filter(d=>SERVICE_DEPTS.includes(d)),
          departmentRoles:allowed.entry.departmentRoles||{},
          email:allowed.email,trustedStaff:true};
      }
    }
    // Technical mode is restricted by a separately configured, verified Discord ID.
    if(bpd.trustedStaff===true&&eligibleForTechnicalProfile(decoded,bpd,member,process.env)&&
       technicalCookieIsValid(req.headers.cookie,decoded.uid,discordId,
         process.env.BPD_PORTAL_PROFILE_SIGNING_KEY)){
      bpd={...bpd,role:'korpsleiding',departments:['politie','brandweer','ambulance','depannage'],
        portalTechnicalMode:true,trustedStaff:true};
    }
    // Bestuur is independent of operational grade. Grant cross-service TRAINING
    // only after verified Discord authentication and a fresh guild role or an
    // approved, unrevoked board appointment; never from a claimed display name.
    const verifiedBoardIdentity=bpd.provider==='discord'&&isDiscordId(discordId)&&
      verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID)===discordId;
    const boardAppointment=verifiedBoardIdentity
      ?await db().collection(BOARD_COLLECTION).doc(discordId).get():null;
    bpd.boardPersonnelAdmin=Boolean(verifiedBoardIdentity&&(
      verifyBoardDiscordRole(member,process.env.DISCORD_GUILD_ID)||
      activeBoardAppointment(boardAppointment?.data())));
    bpd.discordPoliceRank=verifiedOfficerCadre(member,process.env.DISCORD_GUILD_ID,
      Date.now(),15*60*1000);
    // A full dossier delegation may additionally grant training log/review for
    // THAT department. Validate the portal account and a fresh Discord identity.
    // Never turn a delegation into a global cadre or role-management grant.
    bpd.dossierFullDepartments=[];
    if(bpd.provider==='discord'&&process.env.BPD_ENABLE_DISCORD_PORTAL_LOGIN==='true'&&
       verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID)===discordId){
      const portal=await db().collection(USER_COLLECTION).doc(discordId).get();
      const managed=portal.exists?approvedManagedEntry(portal.data(),discordId):null;
      const services=portal.exists
        ?(managed?.departments||[])
        :(bpd.trustedStaff===true?bpd.departments:[]);
      const eligible=services.filter(dept=>DOSSIER_DEPTS.includes(dept));
      const checked=await Promise.all(eligible.map(async dept=>{
        const g=await db().collection(DOSSIER_GRANT_COLLECTION)
          .doc(dossierGrantKey(dept,discordId)).get();
        return activeDossierGrant(g.data(),dept,discordId)&&g.get('level')==='full'?dept:null;
      }));
      bpd.dossierFullDepartments=checked.filter(Boolean);
    }
    const fireTeacherIds=String(process.env.BPD_FIRE_INSTRUCTOR_ROLE_IDS||'')
      .split(/[\s,;]+/).filter(isDiscordId);
    const base=basePermissions(member,process.env.DISCORD_GUILD_ID,Date.now(),fireTeacherIds);
    // Never infer rank from a stale role snapshot, or from an unrelated Discord ID.
    const override=isDiscordId(discordId)?(await db().collection('bpd_permission_overrides').doc(discordId).get()).data():null;
    req.roleActor={bpd,discordId,member,base,perms:effectivePermissions(base,override),override};
    next();
  }catch(e){console.error('Rolaanmelding mislukt:',e?.code||e?.message||'onbekend');return res.status(401).json({error:'Verificatie niet beschikbaar'});}
}
function admin(req,res,next){
  // Bootstrap only through the existing approved Google allowlist. Discord-only sessions
  // cannot change other people's rights, even with a leadership Discord role.
  const actor=req.roleActor?.bpd;
  if(!actor?.trustedStaff || !['officierenkader','korpsleiding'].includes(actor.role))return res.status(403).json({error:'Alleen vooraf gemachtigd hoger kader mag rollen beheren'});
  next();
}
function trainingAccess(req,dept,kind){
  const {bpd,perms}=req.roleActor;
  return kind==='log'?canLogTraining(bpd,dept,perms):canReviewTraining(bpd,dept,perms);
}
function inputRecord(x){
  const department=asText(x?.department,40),discordId=asText(x?.discordId,40);
  const courseName=asText(x?.courseName,150),details=asText(x?.details,1600),eventDate=asText(x?.eventDate,20),result=asText(x?.result,32);
  if(!SERVICE_DEPTS.includes(department)||!isDiscordId(discordId))throw new Error('Ongeldige dienst of Discord ID');
  if(courseName.length<3 || typeof x?.courseName!=='string' || x.courseName.length>150)throw new Error('Ongeldige opleidingsnaam');
  if(typeof x?.details!=='string'||x.details.length>1600)throw new Error('Omschrijving te lang');
  if(!['in_opleiding','geslaagd','niet_geslaagd','restricted'].includes(result))throw new Error('Ongeldig opleidingsresultaat');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)||new Date(eventDate+'T12:00:00Z').toISOString().slice(0,10)!==eventDate||eventDate>new Date().toISOString().slice(0,10))throw new Error('Ongeldige opleidingsdatum');
  return {department,subjectDiscordId:discordId,courseName,details,eventDate,result};
}
const error=(res,e)=>{console.error('Rollen/opleidingen:',e?.code||e?.message||'onbekend');return res.status(503).json({error:'Firestore tijdelijk niet beschikbaar'});};
export function installRoleRoutes(app,{getSnapshot}={}){
  // Check the ACTUAL personnel roster before disclosing colleague names or
  // writing a training result. A role never creates an imaginary personnel record.
  const findSubject=async(dept,discordId)=>{
    if(typeof getSnapshot!=='function')throw Error('Personeelsbron niet gekoppeld');
    const snap=await getSnapshot();
    if(snap.stale)throw Error('Personeelsbron is niet actueel');
    const matches=snap.data.filter(p=>p.dept===dept&&p.personId===discordId);
    return matches.length===1?matches[0]:null;
  };
  const mayAccessSubject=(bpd,subject,roleMap)=>{
    if(bpd?.boardPersonnelAdmin===true)return true;
    if(subject.dept==='brandweer')return ['member','trainee'].includes(
      fireSubjectClass(subject,roleMap?.get(subject.personId)||null));
    const mayOpenCorps=bpd?.provider==='discord'&&bpd?.trustedStaff===true&&
      bpd?.role==='korpsleiding'&&roleForDepartment(bpd,'politie')==='korpsleiding'&&
      bpd?.discordPoliceRank==='Korpsleiding';
    if(subject.dept==='politie'&&isPolice9xx(subject.call))
      return roleMap?.get(subject.personId)==='Officierenkader'||mayOpenCorps;
    return !isCorpsLeadershipPersonnel(subject)||mayOpenCorps;
  };
  async function verifiedSubjects(subjects){
    const map=new Map(),guildId=process.env.DISCORD_GUILD_ID;
    const ids=[...new Set(subjects.filter(p=>p?.dept==='politie'&&
      isPolice9xx(p.call)&&isDiscordId(p.personId)).map(p=>p.personId))];
    if(!isDiscordId(guildId)||!ids.length)return map;
    const collection=db().collection('bpd_discord_auth');
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50);
      const results=await db().getAll(...chunk.map(id=>collection.doc(id)));
      for(let j=0;j<results.length;j++){
        const role=results[j].exists?
          verifiedOfficerCadre(results[j].data(),guildId,Date.now(),15*60*1000):null;
        if(role)map.set(chunk[j],role);
      }
    }
    // Docenten en Brandweerleiding mogen enkel opleidingen voor basisleden en
    // stagiairs invoeren. Middenkader en leidinggevende doelpersonen blijven dicht.
    const fireIds=[...new Set(subjects.filter(p=>p?.dept==='brandweer'&&
      isDiscordId(p.personId)).map(p=>p.personId))];
    for(let i=0;i<fireIds.length;i+=40){
      const group=fireIds.slice(i,i+40);
      const results=await db().getAll(...group.map(id=>
        collection.doc(id)));
      for(let j=0;j<group.length;j++)
        map.set(group[j],verifiedFireRoles(results[j].data(),guildId));
    }
    return map;
  }
  async function guardTrainingSubject(req,res,next){
    const {department,discordId}=req.params;
    if(!SERVICE_DEPTS.includes(department)||!isDiscordId(discordId))
      return res.status(400).json({error:'Ongeldige opleidingsdossierverwijzing'});
    try {
      const subject=await findSubject(department,discordId);
      if(!subject)return res.status(404).json({error:'Geen eenduidig personeelslid binnen deze hulpdienst'});
      const verified=await verifiedSubjects([subject]);
      if(!mayAccessSubject(req.roleActor.bpd,subject,verified))
        return res.status(403).json({error:'Dit personeelsdossier is afgeschermd'});
      req.trainingSubjectRoles=verified;
      next();
    }catch(e){error(res,e)}
  }
  app.get('/api/roles/catalog',resolveActor,(req,res)=>res.json({roles:ROLE_CATALOG,departments:SERVICE_DEPTS}));
  app.get('/api/roles/me',resolveActor,(req,res)=>{
    const {bpd,discordId,base,perms}=req.roleActor;
    return res.json({provider:bpd.provider,discordId:discordId||null,googleRank:bpd.trustedStaff?bpd.role:null,
      verifiedRolesFresh:base.fresh,roles:base.roles,departments:base.departments,
      policeRank:base.policeRank,unknownRoleCount:base.unknownCount,
      permissions:visibleTrainingPermissions(bpd,perms),canManage:bpd.trustedStaff===true&&['officierenkader','korpsleiding'].includes(bpd.role),
      trainingWritesEnabled:process.env.BPD_ENABLE_TRAINING_WRITES==='true',
      note:'Discord-toekenningen en Google Sheets worden NIET automatisch aangepast. Bestaande dossiers blijven onder de huidige Google-allowlist.'});
  });
  app.get('/api/roles/overrides/:discordId',resolveActor,admin,async(req,res)=>{
    const id=req.params.discordId;
    if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{const doc=await db().collection('bpd_permission_overrides').doc(id).get();
      const departments=Object.fromEntries(Object.entries(doc.data()?.departments||{}).filter(([dept])=>canAdministerRoles(req.roleActor.bpd,dept)));
      res.json({discordId:id,departments,delegatablePermissions:DELEGATABLE_PERMISSIONS});}
    catch(e){error(res,e)}
  });
  app.patch('/api/roles/overrides/:discordId',resolveActor,admin,async(req,res)=>{
    const target=req.params.discordId,actor=req.roleActor.bpd;
    if(!isDiscordId(target))return res.status(400).json({error:'Ongeldige Discord ID'});
    if(!isDiscordId(actor.discordId))return res.status(403).json({error:'Beheeraccount heeft geen gekoppelde Discord ID'});
    if(target===actor.discordId)return res.status(403).json({error:'Eigen bevoegdheden kunnen niet worden aangepast'});
    let change;try{change=validateOverride(req.body)}catch(e){return res.status(400).json({error:e.message})}
    if(!canAdministerRoles(actor,change.department))return res.status(403).json({error:'Geen beheerrecht voor deze dienst'});
    if(process.env.BPD_ENABLE_PERMISSION_WRITES!=='true')return res.status(503).json({error:'Machtigingswijzigingen staan nog uit. Activeer BPD_ENABLE_PERMISSION_WRITES=true na testen.'});
    try{
      const targetRef=db().collection('bpd_permission_overrides').doc(target);
      // No broad Firestore document read: use a transaction so concurrent edits are audited.
      await db().runTransaction(async tx=>{
        const old=await tx.get(targetRef),data=old.data()||{},depts={...(data.departments||{})},existing={...(depts[change.department]||{})};
        const prev=existing[change.permission]||null;
        if(change.action==='inherit')delete existing[change.permission];
        else existing[change.permission]={action:change.action,expiresOn:change.expiresOn,reason:change.reason,changedBy:actor.discordId,at:Date.now()};
        depts[change.department]=existing;
        tx.set(targetRef,{departments:depts,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.create(db().collection('bpd_permission_audit').doc(),{targetDiscordId:target,department:change.department,permission:change.permission,previous:prev,next:existing[change.permission]||null,reason:change.reason,actorDiscordId:actor.discordId,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
      });
      res.json({saved:true,googleSheetsUpdated:false,discordRolesUpdated:false});
    }catch(e){error(res,e)}
  });
  app.get('/api/training/people',resolveActor,async(req,res)=>{
    const department=asText(req.query?.department,40);
    if(!SERVICE_DEPTS.includes(department))return res.status(400).json({error:'Ongeldige hulpdienst'});
    if(!trainingAccess(req,department,'log')&&!trainingAccess(req,department,'review'))
      return res.status(403).json({error:'Geen opleidingsrechten binnen deze hulpdienst'});
    try{
      const snap=await getSnapshot();
      if(snap.stale)return res.status(503).json({error:'Personeelslijst is momenteel niet actueel'});
      const counts=new Map();
      for(const p of snap.data)if(p.dept===department&&isDiscordId(p.personId))
        counts.set(p.personId,(counts.get(p.personId)||0)+1);
      const verified=await verifiedSubjects(snap.data.filter(p=>p.dept===department));
      const people=snap.data.filter(p=>p.dept===department&&isDiscordId(p.personId)&&
        counts.get(p.personId)===1&&mayAccessSubject(req.roleActor.bpd,p,verified))
        .map(p=>({discordId:p.personId,call:p.call,name:p.name,department:p.dept}))
        .sort((a,b)=>String(a.call||'').localeCompare(String(b.call||''),'nl',{numeric:true}));
      res.set('Cache-Control','private, no-store');
      res.json({department,people,limited:false});
    }catch(e){error(res,e)}
  });
  app.get('/api/training/:department/:discordId',resolveActor,guardTrainingSubject,async(req,res)=>{
    const {department,discordId}=req.params;
    if(!SERVICE_DEPTS.includes(department)||!isDiscordId(discordId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    if(!trainingAccess(req,department,'log')&&!trainingAccess(req,department,'review'))return res.status(403).json({error:'Geen toegang tot opleidingen van deze dienst'});
    try{
      const subject=await findSubject(department,discordId);
      if(!subject)return res.status(404).json({error:'Geen eenduidig personeelslid binnen deze hulpdienst'});
      if(!mayAccessSubject(req.roleActor.bpd,subject,req.trainingSubjectRoles))
        return res.status(403).json({error:'Dit dossier is afgeschermd'});
      const all=trainingAccess(req,department,'review');
      const query=db().collection('bpd_training').doc(`${department}_${discordId}`).collection('records');
      // Instructeurs zien enkel eigen evaluaties; gemachtigde beoordelaars mogen het hele opleidingsdossier bekijken.
      const s=await (all?query.orderBy('createdAt','desc').limit(100):query.where('registeredByDiscordId','==',req.roleActor.bpd.discordId).limit(100)).get();
      const actorId=req.roleActor.bpd.discordId,mayLog=trainingAccess(req,department,'log');
      const rows=s.docs.filter(d=>!isArchivedTraining(d.data())).map(d=>({id:d.id,...d.data(),
        canEdit:mayMaintainTraining(d.data(),{actorDiscordId:actorId,mayLog,mayReview:all}),
        canDelete:mayMaintainTraining(d.data(),{actorDiscordId:actorId,mayLog,mayReview:all}),
        createdAt:iso(d.get('createdAt')),reviewedAt:iso(d.get('reviewedAt'))}));
      if(!all)rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      res.json({records:rows,limited:s.size===100,scope:all?'volledig':'alleen_eigen_registraties'});
    }catch(e){error(res,e)}
  });
  app.post('/api/training',resolveActor,async(req,res)=>{
    if(process.env.BPD_ENABLE_TRAINING_WRITES!=='true')return res.status(503).json({error:'Opleidingsregistratie staat nog uit'});
    let data;try{data=inputRecord(req.body)}catch(e){return res.status(400).json({error:e.message})}
    if(!trainingAccess(req,data.department,'log'))return res.status(403).json({error:'Geen opleidingsregistratierecht voor deze dienst'});
    const actor=req.roleActor.bpd;
    if(!isDiscordId(actor.discordId))return res.status(403).json({error:'Geen gekoppelde Discord ID voor instructeur'});
    try{
      const subject=await findSubject(data.department,data.subjectDiscordId);
      if(!subject)return res.status(404).json({error:'Geen eenduidig personeelslid binnen deze hulpdienst'});
      if(!mayAccessSubject(actor,subject,await verifiedSubjects([subject])))
        return res.status(403).json({error:'Dit dossier is afgeschermd'});
      const record=db().collection('bpd_training').doc(`${data.department}_${data.subjectDiscordId}`).collection('records').doc();
      await record.create({...data,registeredByDiscordId:actor.discordId,registeredByProvider:actor.provider,
        status:'geregistreerd',cmNotified:false,rosterStatus:'nog_niet_beoordeeld',createdAt:FieldValue.serverTimestamp()});
      res.status(201).json({saved:true,id:record.id,discordRoleUpdated:false,googleSheetsUpdated:false});
    }catch(e){error(res,e)}
  });
  // Editing always preserves subject, department, review authority and the audit trail.
  app.patch('/api/training/:department/:discordId/:recordId',resolveActor,guardTrainingSubject,async(req,res)=>{
    if(process.env.BPD_ENABLE_TRAINING_WRITES!=='true')return res.status(503).json({error:'Opleidingswijzigingen staan uit'});
    const {department,discordId,recordId}=req.params;
    if(!SERVICE_DEPTS.includes(department)||!isDiscordId(discordId)||!isRecordId(recordId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    const mayLog=trainingAccess(req,department,'log'),mayReview=trainingAccess(req,department,'review');
    if(!mayLog&&!mayReview)return res.status(403).json({error:'Geen opleidingsbevoegdheid voor deze dienst'});
    let data,reason;
    try{data=inputRecord({...req.body,department,discordId});reason=validateMaintenanceReason(req.body?.reason)}
    catch(e){return res.status(400).json({error:e.message})}
    const actor=req.roleActor.bpd;
    if(!isDiscordId(actor.discordId))return res.status(403).json({error:'Geen gekoppelde Discord ID'});
    const ref=db().collection('bpd_training').doc(`${department}_${discordId}`).collection('records').doc(recordId);
    try{
      await db().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)throw Object.assign(Error('Registratie niet gevonden'),{status:404});
        const old=snap.data();
        if(!mayMaintainTraining(old,{actorDiscordId:actor.discordId,mayLog,mayReview}))throw Object.assign(Error('Geen wijzigingsrecht op deze registratie'),{status:403});
        const before=Object.fromEntries(['courseName','details','eventDate','result','rosterStatus'].map(k=>[k,old[k]??null]));
        const next={courseName:data.courseName,details:data.details,eventDate:data.eventDate,result:data.result};
        if(requiresReReview(old,next))next.rosterStatus='ter_controle';
        tx.update(ref,{...next,updatedAt:FieldValue.serverTimestamp(),updatedByDiscordId:actor.discordId});
        tx.create(ref.collection('audit').doc(),{kind:'record-edit',previous:before,next:{...next},reason,
          actorDiscordId:actor.discordId,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
      });
      res.json({saved:true,googleSheetsUpdated:false,discordRolesUpdated:false});
    }catch(e){if(e.status===403||e.status===404)return res.status(e.status).json({error:e.message});error(res,e)}
  });

  // "Verwijderen" is archival, not physical deletion: audits remain intact.
  app.delete('/api/training/:department/:discordId/:recordId',resolveActor,guardTrainingSubject,async(req,res)=>{
    if(process.env.BPD_ENABLE_TRAINING_WRITES!=='true')return res.status(503).json({error:'Opleidingswijzigingen staan uit'});
    const {department,discordId,recordId}=req.params;
    if(!SERVICE_DEPTS.includes(department)||!isDiscordId(discordId)||!isRecordId(recordId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    const mayLog=trainingAccess(req,department,'log'),mayReview=trainingAccess(req,department,'review');
    if(!mayLog&&!mayReview)return res.status(403).json({error:'Geen opleidingsbevoegdheid voor deze dienst'});
    let reason;try{reason=validateMaintenanceReason(req.body?.reason)}catch(e){return res.status(400).json({error:e.message})}
    const actor=req.roleActor.bpd;
    if(!isDiscordId(actor.discordId))return res.status(403).json({error:'Geen gekoppelde Discord ID'});
    const ref=db().collection('bpd_training').doc(`${department}_${discordId}`).collection('records').doc(recordId);
    try{
      await db().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)throw Object.assign(Error('Registratie niet gevonden'),{status:404});
        const old=snap.data();
        if(!mayMaintainTraining(old,{actorDiscordId:actor.discordId,mayLog,mayReview}))throw Object.assign(Error('Geen verwijderrecht op deze registratie'),{status:403});
        tx.update(ref,{status:'verwijderd',archivedAt:FieldValue.serverTimestamp(),archivedByDiscordId:actor.discordId,archiveReason:reason});
        tx.create(ref.collection('audit').doc(),{kind:'record-archive',previousStatus:old.status||'geregistreerd',reason,
          actorDiscordId:actor.discordId,actorUid:actor.uid,at:FieldValue.serverTimestamp()});
      });
      res.json({archived:true,googleSheetsUpdated:false,discordRolesUpdated:false});
    }catch(e){if(e.status===403||e.status===404)return res.status(e.status).json({error:e.message});error(res,e)}
  });

  app.post('/api/training/:department/:discordId/:recordId/review',resolveActor,guardTrainingSubject,async(req,res)=>{
    if(process.env.BPD_ENABLE_TRAINING_WRITES!=='true')return res.status(503).json({error:'Beoordelingen staan nog uit'});
    const {department,discordId,recordId}=req.params;
    if(!SERVICE_DEPTS.includes(department)||!isDiscordId(discordId)||!/^[A-Za-z0-9]{12,30}$/.test(recordId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    if(!trainingAccess(req,department,'review'))return res.status(403).json({error:'Geen bevoegdheid voor officiële opleidingscontrole'});
    const actor=req.roleActor.bpd;
    if(!isDiscordId(actor.discordId))return res.status(403).json({error:'Geen gekoppelde Discord ID'});
    const status=asText(req.body?.status,40),reason=asText(req.body?.reason,500);
    if(!['klaar_voor_manuele_invoer','ter_controle'].includes(status)||reason.length<8||typeof req.body?.reason!=='string'||req.body.reason.length>500)return res.status(400).json({error:'Ongeldige beoordeling of reden'});
    const ref=db().collection('bpd_training').doc(`${department}_${discordId}`).collection('records').doc(recordId);
    try{
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists)throw Object.assign(new Error('Registratie niet gevonden'),{status:404});
        const old=doc.data();
        if(isArchivedTraining(old))throw Object.assign(new Error('Verwijderde registratie kan niet beoordeeld worden'),{status:409});
        // Approved entries are STILL NOT written into Google Sheets.
        tx.update(ref,{rosterStatus:status,reviewReason:reason,reviewedByDiscordId:actor.discordId,reviewedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{kind:'manual-roster-review',previous:old.rosterStatus||null,next:status,reason,actorDiscordId:actor.discordId,at:FieldValue.serverTimestamp()});
      });
      res.json({saved:true,googleSheetsUpdated:false,discordRolesUpdated:false});
    }catch(e){if(e.status===404||e.status===409)return res.status(e.status).json({error:e.message});error(res,e)}
  });
}
