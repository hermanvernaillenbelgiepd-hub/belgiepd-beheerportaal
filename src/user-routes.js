import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleSummary} from './role-catalog.js';
import {isVerifiedTechnicalRoleApprover} from './manual-role-decision-policy.js';
import {SERVICE_FUNCTIONS,choiceFor,parseServiceFunctionChange,parseServiceRevoke,
  applyServiceFunction,removeServiceFunction,mayEditServiceFunction} from './service-function-policy.js';
import {MANUAL_ROLE_CATALOG} from './manual-role-catalog.js';
import {ensureVerifiedMiddleAccess,stillEligibleAutoCadre,AUTO_CADRE_SOURCE} from './verified-mid-cadre-access.js';
import {makeProfileCookie,clearProfileCookie} from './portal-profile-mode.js';
import {BOARD_COLLECTION,activeBoardAppointment} from './board-appointment-policy.js';
import {verifyBoardDiscordRole} from './dossier-grants.js';
import {roleForDepartment} from './leave-policy.js';
import {USER_COLLECTION,USER_DEPTS,verifiedDiscordIdentity,validUserGrant,validAccountCategory,mayLabelAccount,
  isUserManager,canSeeUser,canChangeUser,canBlockUser,approvedManagedEntry} from './user-access.js';

const validId=id=>/^\d{15,22}$/.test(String(id||''));
function ready(){
  if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  return getFirestore();
}
const denial=(res,status,error)=>res.status(status).json({error});
const fail=(res,e)=>{
  if(e?.publicStatus)return denial(res,e.publicStatus,e.message);
  console.error('Gebruikersbeheer:',e?.code||e?.message||'onbekend');
  return denial(res,503,'Gebruikersbeheer tijdelijk niet beschikbaar');
};
const publicError=(message,publicStatus=403)=>Object.assign(new Error(message),{publicStatus});
const serialize=(id,d)=>({discordId:id,username:String(d.username||'').slice(0,80),
  status:d.status||'pending',candidateDepartments:Array.isArray(d.candidateDepartments)?d.candidateDepartments:[],
  departments:Array.isArray(d.departments)?d.departments:[],
  role:d.status==='approved'?d.role:null,
  // Per-service roles are for displaying the correct service label. They
  // cannot be used by the client to bypass server-side grant validation.
  departmentRoles:d.status==='approved'&&d.departmentRoles&&
    typeof d.departmentRoles==='object'&&!Array.isArray(d.departmentRoles)?
      Object.fromEntries(Object.entries(d.departmentRoles).filter(([dept,role])=>
        Array.isArray(d.departments)&&d.departments.includes(dept)&&
        ['basiskader','middenkader','officierenkader','korpsleiding'].includes(role))):{},
  serviceFunctions:d.status==='approved'&&d.serviceFunctions&&
    typeof d.serviceFunctions==='object'&&!Array.isArray(d.serviceFunctions)?
    Object.fromEntries(Object.entries(d.serviceFunctions).filter(([dept,func])=>
      d.departments?.includes(dept)&&
      choiceFor(dept,func)?.role===d.departmentRoles?.[dept])):{},
  category:d.status==='approved'&&['burger','technisch_medewerker'].includes(d.category)?d.category:null});
export function installUserRoutes(app,{requireUser,accessList,getSnapshot}){
  const db=()=>ready();
  const collection=()=>db().collection(USER_COLLECTION);
  async function discordSubject(req){
    const m=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
    if(!m)throw publicError('Aanmelding vereist',401);
    const decoded=await getAuth().verifyIdToken(m[1]);
    if(decoded.firebase?.sign_in_provider!=='custom'||decoded.bpdDiscord!==true)
      throw publicError('Meld je aan met Discord om toegang aan te vragen');
    const id=String(decoded.uid||'').replace(/^discord:/,'');
    if(!validId(id))throw publicError('Discord-account ongeldig');
    const member=(await db().collection('bpd_discord_auth').doc(id).get()).data();
    const verified=verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID,Date.now(),15*60*1000);
    if(!verified)throw publicError('Vernieuw eerst je Discord-verificatie en probeer opnieuw');
    return {id,member,decoded};
  }
  // This endpoint cannot grant roles. It only creates one pending request tied
  // to an independently verified Discord ID belonging to our own guild.
  app.post('/api/users/request',async(req,res)=>{
    try{
      ready();
      const {id,member,decoded}=await discordSubject(req);
      if(Object.values(accessList()).some(entry=>entry?.discordId===id))
        return res.json({status:'legacy',message:'Je account heeft al een bestaande toewijzing.'});
      const ref=collection().doc(id);
      const existing=await ref.get();
      if(!existing.exists||existing.get('status')==='pending'){
        const auto=await ensureVerifiedMiddleAccess(db(),decoded,member,
          process.env.DISCORD_GUILD_ID,process.env);
        if(auto?.status==='approved')
          return res.json({status:'approved',automatic:true,role:'middenkader',departments:['politie']});
      }
      const candidates=roleSummary(member.roleIds).departments.filter(d=>USER_DEPTS.includes(d));
      try{
        await ref.create({discordId:id,guildId:process.env.DISCORD_GUILD_ID,status:'pending',
          username:String(member.username||'Discord-lid').slice(0,80),
          candidateDepartments:candidates,requestedAt:FieldValue.serverTimestamp(),
          createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      }catch(e){if(e.code!==6&&e.code!=='already-exists')throw e;}
      const saved=await ref.get();
      return res.json({status:saved.get('status')||'pending'});
    }catch(e){return fail(res,e)}
  });
  app.get('/api/users/me',async(req,res)=>{
    try{
      ready();
      const {id,member,decoded}=await discordSubject(req);
      let snap=await collection().doc(id).get();
      const legacy=!snap.exists&&Object.values(accessList()).some(entry=>entry?.discordId===id);
      if(!legacy&&(!snap.exists||snap.get('status')==='pending')){
        const auto=await ensureVerifiedMiddleAccess(db(),decoded,member,
          process.env.DISCORD_GUILD_ID,process.env);
        if(auto)snap=await collection().doc(id).get();
      }
      const d=snap.exists?snap.data():null;
      const active=d?.status==='approved'?
        stillEligibleAutoCadre(decoded,member,process.env.DISCORD_GUILD_ID,process.env,d):false;
      return res.json({discordId:id,username:member.username||'',
        status:d?.status==='approved'&&!active?'reverify':d?.status||(legacy?'legacy':'not_requested'),
        role:active?d.role:null,automatic:d?.approvalSource===AUTO_CADRE_SOURCE});
    }catch(e){return fail(res,e)}
  });
  // The profile switch cannot alter the permanent approval/Discord rank.
  app.get('/api/users/profile',requireUser,(req,res)=>{
    const actor=req.bpd;
    return res.json({technicalAvailable:actor.profileTechnicalAvailable===true,
      mode:actor.portalTechnicalMode===true?'technisch':'politie',
      operationalRole:actor.operationalRole||actor.role,
      discordPoliceRank:actor.discordPoliceRank||null,
      linkedDiscordId:actor.discordId||null});
  });
  app.post('/api/users/profile',requireUser,async(req,res)=>{
    const mode=req.body?.mode;
    if(!['politie','technisch'].includes(mode)||
       !req.body||Object.keys(req.body).some(k=>k!=='mode'))
      return denial(res,400,'Kies een geldig portaalprofiel');
    if(mode==='politie'){
      res.set('Set-Cookie',clearProfileCookie());
      try{
        await db().collection('bpd_portal_profile_audit').add({
          discordId:req.bpd.discordId,actorUid:req.bpd.uid,
          mode:'politie',at:FieldValue.serverTimestamp()});
        return res.json({mode:'politie',changed:true});
      }catch(e){return fail(res,e)}
    }
    if(req.bpd.profileTechnicalAvailable!==true||
       !validId(req.bpd.discordId)||!req.bpd.uid?.startsWith('discord:'))
      return denial(res,403,'Dit Discord-account heeft geen geautoriseerd technisch beheerprofiel');
    try{
      // Failed audit storage must fail closed; a mode switch is security-relevant.
      await db().collection('bpd_portal_profile_audit').add({
        discordId:req.bpd.discordId,actorUid:req.bpd.uid,
        mode:'technisch',at:FieldValue.serverTimestamp()});
      res.set('Set-Cookie',makeProfileCookie(req.bpd.uid,req.bpd.discordId,
        process.env.BPD_PORTAL_PROFILE_SIGNING_KEY));
      return res.json({mode:'technisch',changed:true});
    }catch(e){return fail(res,e)}
  });
  // Only returns the authenticated member's OWN authorisation context.
  // Useful when a valid Discord identity lacks scoped management rights.
  app.get('/api/users/context',requireUser,(req,res)=>{
    const depts=req.bpd.departments||[];
    res.json({role:req.bpd.role,profileMode:req.bpd.portalTechnicalMode===true?'technisch':'politie',departments:depts,
      departmentRoles:Object.fromEntries(depts.map(dept=>[dept,roleForDepartment(req.bpd,dept)||'geen'])),
      canManageUsers:isUserManager(req.bpd),canManageTO:req.bpd.role==='beheerder',
      canViewKnownIds:isVerifiedTechnicalRoleApprover(req.bpd)});
  });
  const admin=(req,res,next)=>isUserManager(req.bpd)?next():denial(res,403,'Alleen officierenkader, korpsleiding en beheer kunnen gebruikers beheren');
  // Independent TO rights: no police or other personnel role is modified.
  // Technical administrators only; verified, approved portal users only.
  const toAdmin=(req,res,next)=>req.bpd?.role==='beheerder'
    ?next():denial(res,403,'Alleen technisch beheer mag TO-rechten beheren');
  const toAccess=()=>db().collection('bpd_to_access');
  const toAudit=()=>db().collection('bpd_to_access_audit');
  const toReason=reason=>typeof reason==='string'&&reason.trim().length>=8&&reason.trim().length<=300
    ?reason.trim():null;
  app.get('/api/users/to-grants',requireUser,toAdmin,async(_req,res)=>{
    try{
      const snap=await toAccess().limit(150).get();
      const entries=snap.docs.map(d=>({discordId:d.id,level:d.data().level||'read',
        status:d.data().status||'revoked',username:String(d.data().username||'').slice(0,80)}));
      // Show historical ENV TO grants too, so an admin can explicitly revoke
      // or replace them using the same Firestore-based controls.
      for(const [key,level] of [['BPD_TO_OPERATOR_DISCORD_IDS','operate'],['BPD_TO_READONLY_DISCORD_IDS','read']]){
        for(const discordId of String(process.env[key]||'').split(',').map(x=>x.trim()).filter(validId)){
          if(!entries.some(entry=>entry.discordId===discordId))
            entries.push({discordId,level,status:'active',username:'Vooraf ingestelde TO-toegang'});
        }
      }
      return res.json({entries,limited:snap.size===150});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/to-grants',requireUser,toAdmin,async(req,res)=>{
    const discordId=String(req.body?.discordId||''),level=req.body?.level,reason=toReason(req.body?.reason);
    if(!validId(discordId)||!['read','operate'].includes(level)||!reason)
      return denial(res,400,'Vul een geldige Discord-ID, TO-toegang en reden van 8-300 tekens in');
    if(discordId===req.bpd.discordId)return denial(res,403,'Je kunt jezelf geen TO-rechten toewijzen');
    try{
      const access=toAccess().doc(discordId),person=collection().doc(discordId),audit=toAudit().doc();
      await db().runTransaction(async tx=>{
        const user=await tx.get(person),existing=await tx.get(access);
        let username='';
        if(user.exists){
          const approved=approvedManagedEntry(user.data(),discordId);
          if(!approved)throw publicError('Dit account is niet goedgekeurd voor het portaal');
          username=String(user.data().username||'').slice(0,80);
        }else{
          // Legacy allowlist accounts are accepted only when the target's
          // original approved ID and role are still valid.
          const legacy=Object.values(accessList()).find(e=>e?.discordId===discordId);
          if(!legacy||!Array.isArray(legacy.departments)||!legacy.departments.length||
             !['basiskader','middenkader','officierenkader','korpsleiding','beheerder'].includes(legacy.role))
            throw publicError('Laat deze Discord-gebruiker eerst de portaalaanmelding goedkeuren');
          username='Bestaand portaalaccount';
        }
        tx.set(access,{discordId,level,status:'active',username,
          updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
        tx.create(audit,{discordId,action:existing.exists?'update':'grant',level,
          actorUid:req.bpd.uid,reason,at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,discordId,level});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/to-grants/:discordId/revoke',requireUser,toAdmin,async(req,res)=>{
    const discordId=req.params.discordId,reason=toReason(req.body?.reason);
    if(!validId(discordId)||!reason)return denial(res,400,'Vul een geldige Discord-ID en reden van 8-300 tekens in');
    if(discordId===req.bpd.discordId)return denial(res,403,'Je kunt je eigen machtiging niet intrekken');
    try{
      const access=toAccess().doc(discordId),audit=toAudit().doc();
      await db().runTransaction(async tx=>{
        const previous=await tx.get(access);
        tx.set(access,{...(previous.exists?previous.data():{}),discordId,status:'revoked',
          level:previous.exists?previous.data().level:'read',
          updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
        tx.create(audit,{discordId,action:'revoke',actorUid:req.bpd.uid,
          reason,at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,discordId,status:'revoked'});
    }catch(e){return fail(res,e)}
  });
  app.get('/api/users/overview',requireUser,admin,async(req,res)=>{
    try{
      const snap=await collection().limit(250).get();
      const scoped=snap.docs.filter(d=>canSeeUser(req.bpd,d.data()));
      const users=[];
      // Read-only, guild-verified Board status. Never grants a rank or privilege.
      // Read in bounded groups to avoid excessive concurrent Firestore requests.
      for(let i=0;i<scoped.length;i+=20){
        const group=await Promise.all(scoped.slice(i,i+20).map(async d=>{
          const summary=serialize(d.id,d.data());
          if(summary.status!=='approved')return {...summary,board:{discord:false,appointed:false}};
          const [member,appointment]=await Promise.all([
            db().collection('bpd_discord_auth').doc(d.id).get(),
            db().collection(BOARD_COLLECTION).doc(d.id).get()
          ]);
          return {...summary,board:{
            discord:verifyBoardDiscordRole(member.data(),process.env.DISCORD_GUILD_ID),
            appointed:activeBoardAppointment(appointment.data())
          }};
        }));
        users.push(...group);
      }
      return res.json({role:req.bpd.role,departments:req.bpd.departments,
        users,roleCatalog:MANUAL_ROLE_CATALOG,functionCatalog:SERVICE_FUNCTIONS,
        limited:snap.size===250});
    }catch(e){return fail(res,e)}
  });
  // Technical manager's union of KNOWN identities, not the full Discord guild.
  // Only IDs from portal accounts, user-verified guild logins and the official
  // personnel source are included. Do not return role IDs, names, tokens,
  // email addresses, source row content or any other personal data.
  app.get('/api/users/known-ids',requireUser,async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    if(!isVerifiedTechnicalRoleApprover(req.bpd))
      return denial(res,403,'Alleen geverifieerd technisch beheer mag gekende Discord-ID’s raadplegen');
    try{
      const LIMIT=501;
      const [accounts,identities,roster]=await Promise.all([
        collection().limit(LIMIT).get(),
        db().collection('bpd_discord_auth').limit(LIMIT).get(),
        getSnapshot()
      ]);
      const known=new Map();
      const append=(id,source,dept,status)=>{
        if(!validId(id))return;
        if(!known.has(id))known.set(id,{discordId:id,sources:new Set(),
          departments:new Set(),status:'geen_portaalaccount'});
        const item=known.get(id);item.sources.add(source);
        if(USER_DEPTS.includes(dept))item.departments.add(dept);
        if(status)item.status=status;
      };
      for(const doc of accounts.docs){
        const data=doc.data();
        append(doc.id,'portaal',null,
          ['approved','pending','blocked'].includes(data?.status)?data.status:'onbekend');
        for(const dept of data?.departments||[])append(doc.id,'portaal',dept);
      }
      for(const doc of identities.docs){
        if(doc.data()?.guildId!==process.env.DISCORD_GUILD_ID)continue;
        append(doc.id,'eigen_discord_verificatie');
      }
      if(!roster.stale){
        for(const person of roster.data||[]){
          if(USER_DEPTS.includes(person?.dept))
            append(person.personId,'personeelsfiche',person.dept);
        }
      }
      const items=[...known.values()].sort((a,b)=>a.discordId.localeCompare(b.discordId))
        .slice(0,1000).map(x=>({
          discordId:x.discordId,sources:[...x.sources],
          departments:[...x.departments],status:x.status
        }));
      return res.json({users:items,count:items.length,readOnly:true,
        coverage:'alleen_gekende_portaal_leden_en_fiches',
        limited:accounts.size===LIMIT||identities.size===LIMIT||
          known.size>1000||roster.stale===true,
        rosterStale:roster.stale===true});
    }catch(e){return fail(res,e)}
  });
  // Classification has no effect on access, roles or department assignments.
  app.post('/api/users/:discordId/category',requireUser,admin,async(req,res)=>{
    if(!validId(req.params.discordId))return denial(res,400,'Ongeldige Discord-ID');
    let change;
    try{change=validAccountCategory(req.body)}catch(e){return denial(res,400,e.message)}
    const ref=collection().doc(req.params.discordId);
    try{
      await db().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)throw publicError('Gebruikersaccount niet gevonden',404);
        const data=snap.data();
        if(!mayLabelAccount(req.bpd,{...data,discordId:req.params.discordId},change.category))
          throw publicError('Je mag deze categorie niet aan dit account toewijzen');
        tx.update(ref,{category:change.category,updatedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{
          action:'category_update',category:change.category,
          previousCategory:data.category||null,reason:change.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||'',
          at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,category:change.category,permissionsChanged:false});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/:discordId/approve',requireUser,admin,async(req,res)=>{
    if(!validId(req.params.discordId))return denial(res,400,'Ongeldige Discord ID');
    let grant;
    try{grant=validUserGrant(req.body)}catch(e){return denial(res,400,e.message)}
    const ref=collection().doc(req.params.discordId);
    try{
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists)throw publicError('Geen toegangsaanvraag gevonden',404);
        const data=doc.data();
        if(!canChangeUser(req.bpd,req.params.discordId,data,grant))
          throw publicError('Je mag deze medewerker, functie of hulpdienst niet wijzigen');
        if(data.status==='approved'&&
           (data.departments.length!==grant.departments.length||
            !grant.departments.every(dept=>data.departments.includes(dept))))
          throw publicError('Wijzig een goedgekeurd account per afzonderlijke hulpdienst',409);
        const audit=ref.collection('audit').doc();
        tx.update(ref,{status:'approved',role:grant.role,departments:grant.departments,
          departmentRoles:grant.departmentRoles,
          serviceFunctions:grant.functionId?
            {[grant.departments[0]]:grant.functionId}:{},
          approvalSource:FieldValue.delete(),
          category:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp(),
          approvedAt:FieldValue.serverTimestamp(),approvedBy:req.bpd.uid});
        tx.create(audit,{action:'approve',actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||'',
          reason:grant.reason,role:grant.role,departments:grant.departments,
          functionId:grant.functionId||null,
          at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,status:'approved'});
    }catch(e){return fail(res,e)}
  });
  // Per-service changes preserve every OTHER department and its role.
  // Formal Discord roles, medical licences and independent protected dossier
  // permissions are never written by this route.
  app.post('/api/users/:discordId/service-function',requireUser,admin,async(req,res)=>{
    const target=req.params.discordId;
    if(!validId(target))return denial(res,400,'Ongeldige Discord-ID');
    let change;
    try{change=parseServiceFunctionChange(req.body)}
    catch(e){return denial(res,400,e.message)}
    try{
      const ref=collection().doc(target);
      await db().runTransaction(async tx=>{
        const snap=await tx.get(ref),data=snap.data();
        const approved=approvedManagedEntry(data,target);
        if(!approved)throw publicError('Alleen bestaande, goedgekeurde portaalaccounts kunnen gewijzigd worden',409);
        const technical=isVerifiedTechnicalRoleApprover(req.bpd);
        if(!mayEditServiceFunction(req.bpd,target,approved,change.department,change.role,{technical}))
          throw publicError('Je mag deze hulpdienst of functie niet wijzigen');
        const previous=approved.departmentRoles[change.department]||null;
        if(!approved.departments.includes(change.department)){
          const identity=await tx.get(db().collection('bpd_discord_auth').doc(target));
          const member=identity.data();
          if(member?.guildId!==process.env.DISCORD_GUILD_ID||
             !Number.isSafeInteger(member?.verifiedAt)||
             Date.now()-member.verifiedAt>7*86400000||
             member.verifiedAt>Date.now()||
             !Array.isArray(member.roleIds))
            throw publicError('De medewerker moet eerst zijn eigen Discord-lidmaatschap opnieuw verifiëren',409);
        }
        const updated=applyServiceFunction({
          ...approved,serviceFunctions:data.serviceFunctions
        },change);
        const clearRecovery=data.manualRoleRecovery?.dept===change.department&&
          data.manualRoleRecovery.role!==change.role;
        tx.update(ref,{...updated,approvalSource:FieldValue.delete(),
          ...(clearRecovery?{manualRoleRecovery:FieldValue.delete()}:{}),
          updatedAt:FieldValue.serverTimestamp(),approvedBy:req.bpd.uid});
        tx.create(ref.collection('audit').doc(),{
          action:'service_function_update',department:change.department,
          previousRole:previous,role:change.role,functionId:change.functionId,
          reason:change.reason,actorUid:req.bpd.uid,
          actorDiscordId:req.bpd.discordId||'',
          at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,department:change.department,
        functionId:change.functionId,discordRoleChanged:false});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/:discordId/service-revoke',requireUser,admin,async(req,res)=>{
    const target=req.params.discordId;
    if(!validId(target))return denial(res,400,'Ongeldige Discord-ID');
    let change;
    try{change=parseServiceRevoke(req.body)}
    catch(e){return denial(res,400,e.message)}
    try{
      const ref=collection().doc(target);
      await db().runTransaction(async tx=>{
        const snap=await tx.get(ref),data=snap.data();
        const approved=approvedManagedEntry(data,target);
        if(!approved)throw publicError('Het account is niet goedgekeurd',409);
        if(!mayEditServiceFunction(req.bpd,target,approved,change.department,null,{
          technical:isVerifiedTechnicalRoleApprover(req.bpd)}))
          throw publicError('Je mag deze diensttoegang niet intrekken');
        if(approved.departments.length<2)
          throw publicError('Dit is de laatste hulpdienst. Gebruik Blokkeer om alle portaaltoegang in te trekken',409);
        const updated=removeServiceFunction({
          ...approved,serviceFunctions:data.serviceFunctions
        },change.department);
        tx.update(ref,{...updated,approvalSource:FieldValue.delete(),
          ...(data.manualRoleRecovery?.dept===change.department?
            {manualRoleRecovery:FieldValue.delete()}:{}),
          updatedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{
          action:'service_function_revoke',department:change.department,
          previousRole:approved.departmentRoles[change.department],
          reason:change.reason,actorUid:req.bpd.uid,
          actorDiscordId:req.bpd.discordId||'',
          at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,revokedDepartment:change.department,
        otherDepartmentsPreserved:true,discordRoleChanged:false});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/:discordId/block',requireUser,admin,async(req,res)=>{
    if(!validId(req.params.discordId))return denial(res,400,'Ongeldige Discord ID');
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(reason.length<8||reason.length>300)return denial(res,400,'Reden moet 8 tot 300 tekens bevatten');
    const ref=collection().doc(req.params.discordId);
    try{
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists)throw publicError('Gebruiker niet gevonden',404);
        const data=doc.data();
        if(!canBlockUser(req.bpd,req.params.discordId,data))
          throw publicError('Je mag deze gebruiker niet blokkeren');
        const audit=ref.collection('audit').doc();
        tx.update(ref,{status:'blocked',blockedAt:FieldValue.serverTimestamp(),
          blockedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
        tx.create(audit,{action:'block',actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||'',
          reason,at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,status:'blocked'});
    }catch(e){return fail(res,e)}
  });
}
