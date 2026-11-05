import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {linkEnabled,validateLinkReference,verifiedLinkRequester,mayApproveLink,mayRejectLink,bearerToken} from './personnel-link.js';
import {LIFECYCLE_SERVICES} from './personnel-lifecycle-policy.js';
import {canManageLifecycleDepartment,canManagePersonnelLifecycle} from './personnel-lifecycle-access.js';
import {PERSONNEL_EDITS_COLLECTION,EDITABLE_STATUSES,validPersonnelKey,
  canViewPersonnel,canReadPersonnelSubject,canEditPersonnel,canEditGeneralPersonnelInfo,canChangePersonnelStatus,canRenameLowerPolice,validateLowerPoliceRename,validatePersonnelChange,mergePersonnelEdits,
  currentPersonnelAuditActor,personnelCallClaimId} from './personnel-editor-policy.js';
import {CREATED_PERSONNEL_COLLECTION,PENDING_PERSONNEL_COLLECTION,TEST_RANKS,
  personnelDataEnabled,personnelCreationEnabled,canCreatePersonnel,canAuthoriseExceptionalPoliceRank,
  nextPoliceRank,validatePolicePromotion,
  STANDARD_ENTRY_RANK,validateNewPersonnel,uniqueNewPerson,
  visiblePendingPersonnel} from './personnel-create.js';

import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {isPolice9xx} from './verified-police-cadre.js';
import {checkServiceEnrollment} from './service-enrollment-policy.js';
import {displaySeries} from './normalize.js';
import {canChangePoliceGrade,allowedPoliceGradeChoices,
  validatePoliceGradeChange,classifyPoliceGradeChange} from './personnel-rank-policy.js';

const error=(res,status,message)=>res.status(status).json({error:message});
const asTime=x=>x?.toDate?.().toISOString?.()||null;
function safeResponse(res,e){
  if(e?.publicStatus)return error(res,e.publicStatus,e.message);
  console.error('Personeelsbeheer:',e?.code||e?.message||'onbekende fout');
  return error(res,503,'Personeelsbeheer is momenteel niet beschikbaar');
}
function userError(status,message){return Object.assign(new Error(message),{publicStatus:status})}
export function installPersonnelEditorRoutes(app,{requireUser,requireDossierUser=requireUser,getSnapshot}){
  const collection=()=>getFirestore().collection(PERSONNEL_EDITS_COLLECTION);
  // Production defaults to read-only; authorized users cannot bypass the flag.
  const writes=()=>process.env.BPD_ENABLE_PERSONNEL_WRITES==='true';
  app.get('/api/personnel/overview',requireDossierUser,async(req,res)=>{
    try {
      const lifecycleDepartments=LIFECYCLE_SERVICES.filter(dept=>canManageLifecycleDepartment(req.bpd,dept));
      const allowed=[...new Set([
       ...(req.bpd.dossierAllowedDepartments||req.bpd.departments||[])
        .filter(d=>canReadServiceDossier(req.bpd,d)),
       ...(lifecycleDepartments.includes('burger')?['burger']:[])
      ])];
      if(!allowed.length)return error(res,403,'Je hebt geen kaderrechten voor personeelsbeheer');
      const [snapshot,edits,pending]=await Promise.all([
        getSnapshot(),collection().limit(400).get(),
        personnelDataEnabled(process.env)?getFirestore().collection(PENDING_PERSONNEL_COLLECTION)
          .limit(500).get():Promise.resolve({docs:[],size:0})
      ]);
      // De overzichtslijst blijft zichtbaar, ook wanneer de individuele
       // personeelsfiche beschermd is tegen inzage.
       const base=snapshot.data.filter(p=>allowed.includes(p.dept));
      const overlay=edits.docs.map(d=>d.data());
      const records=mergePersonnelEdits(base,overlay).map(p=>{
        const edit=overlay.find(e=>e.dept===p.dept&&e.discordId===p.personId);
        const canOpenDossier=p.dept!=='burger'&&canReadPersonnelSubject(req.bpd,p);
        const canPromote=Boolean(canOpenDossier&&p.createdInFirestore===true&&p.dept==='politie'&&
          nextPoliceRank(p.rank)&&req.bpd.discordId!==p.personId&&
          canAuthoriseExceptionalPoliceRank(req.bpd,'politie'));
        return {discordId:p.personId,dept:p.dept,name:p.name,call:p.call,rank:p.rank,
          verifiedCitizenRole:p.dept==='burger'&&p.citizenRoleSource==='discord-api-display',
          canOpenDossier,canManageLifecycle:canManagePersonnelLifecycle(req.bpd,p),
          canPromote,nextPromotionRank:canPromote?nextPoliceRank(p.rank):null,
          canChangeRank:canChangePoliceGrade(req.bpd,p),
          series:displaySeries(p.seriesRaw??p.series,p.rank,p.dept,p.call),status:p.status,
          // Private activity summary only for authenticated service managers.
          hours:Number.isFinite(p.hours)?p.hours:null,
          totalHours:Number.isFinite(p.totalHours)?p.totalHours:null,
          lastConnection:typeof p.lastConnection==='string'?p.lastConnection.slice(0,80):null,
          // Presentation-only specialties from the already-authorized Sheets
          // roster. Do not treat these values as Discord role grants.
          specialties:Array.isArray(p.specialties)?p.specialties.slice(0,16)
            .filter(x=>x&&typeof x.label==='string'&&typeof x.value==='string'&&
              (p.dept!=='politie'||x.label!=='LRD (Recherche)'))
            .map(x=>({label:x.label.slice(0,64),value:x.value.slice(0,90)})):[],
          revision:Number.isSafeInteger(edit?.revision)?edit.revision:0,
          source:edit?'firestore-overlay':p.source==='firestore-created'?'firestore-created':'google-sheets',
          canEdit:canOpenDossier&&canEditGeneralPersonnelInfo(req.bpd,p),
          canRename:canOpenDossier&&canRenameLowerPolice(req.bpd,p),
          canEditIdentity:canOpenDossier&&canEditGeneralPersonnelInfo(req.bpd,p),
          canEditStatus:canOpenDossier&&canEditGeneralPersonnelInfo(req.bpd,p)};
      });
      const labelledRecords=records.map(p=>({...p,
        discordCadre:p.dept==='politie'&&isPolice9xx(p.call)?
          req.bpd.verifiedPoliceSubjectRoles?.[p.discordId]||null:null,
        verifiedFunction:p.dept==='depannage'?
          req.bpd.depannageSubjectFunctions?.[p.discordId]||null:null}));
      const pendingPersonnel=pending.docs.map(d=>visiblePendingPersonnel(d.id,d.data()))
        .filter(p=>p&&allowed.includes(p.dept)&&canCreatePersonnel(req.bpd,p.dept));
      return res.json({records:labelledRecords,pendingPersonnel,
        testMode:process.env.BPD_TEST_FIXTURES==='true',pendingLimited:pending.size===500,
        canViewPersonnelDiagnostics:req.bpd.boardPersonnelAdmin===true,
        role:req.bpd.role,departments:allowed,lifecycleDepartments,
        writesEnabled:writes(),createEnabled:personnelCreationEnabled(process.env),
        promotionsEnabled:personnelDataEnabled(process.env)&&process.env.BPD_ENABLE_PERSONNEL_RANK_CHANGES==='true',
        rankChangesEnabled:personnelDataEnabled(process.env)&&writes()&&
          process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true'&&
          process.env.BPD_ENABLE_PERSONNEL_RANK_CHANGES==='true',
        rankOptions:allowedPoliceGradeChoices(req.bpd),
        createRanks:Object.fromEntries(allowed.filter(dept=>canCreatePersonnel(req.bpd,dept)).map(dept=>[dept,dept==='politie'&&!canAuthoriseExceptionalPoliceRank(req.bpd,dept)?[STANDARD_ENTRY_RANK.politie]:TEST_RANKS[dept]])),
        overridesActive:process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true',
        sourceStale:snapshot.stale,limited:edits.size===400,statuses:EDITABLE_STATUSES});
    }catch(e){return safeResponse(res,e)}
  });
  // Authorised intake: separate production enablement; source Sheets stay read-only.
  // Creating a personnel row never creates Firebase users, Discord roles or portal access.
  app.post('/api/personnel/new',requireDossierUser,async(req,res)=>{
    if(!personnelCreationEnabled(process.env))
      return error(res,503,'Nieuwe personeelsleden toevoegen is hier niet ingeschakeld');
    let proposed;
    try{proposed=validateNewPersonnel(req.body)}catch(e){return error(res,400,e.message)}
    if(!canCreatePersonnel(req.bpd,proposed.dept))
      return error(res,403,'Geen bevoegdheid om personeelsleden in deze hulpdienst aan te maken');
    if(proposed.exceptionalRank&&!canAuthoriseExceptionalPoliceRank(req.bpd,proposed.dept))
      return error(res,403,'Een uitzonderlijke politie-instaprang vereist toestemming van korpsleiding of beheerder');
    try{
      // Reject intake rather than trusting a stale cached personnel roster.
      const snap=await getSnapshot({forceRefresh:true});
      if(snap.stale)return error(res,503,'De actuele personeelsbron kan niet worden gecontroleerd. Probeer later opnieuw.');
      const enrollment=checkServiceEnrollment(snap.data,proposed.dept,proposed.discordId);
      if(!enrollment.allowed)return error(res,409,enrollment.reason);
      try{uniqueNewPerson(snap.data,proposed)}
      catch(e){return error(res,409,e.message)}
      const store=getFirestore();
      const pending=!proposed.discordId;
      const ref=pending?store.collection(PENDING_PERSONNEL_COLLECTION).doc():
        store.collection(CREATED_PERSONNEL_COLLECTION).doc(proposed.dept+'_'+proposed.discordId);
      const claim=store.collection('bpd_personnel_call_claims')
        .doc(personnelCallClaimId(proposed.dept,proposed.call));
      await store.runTransaction(async tx=>{
        const [existing,reserved]=await Promise.all([tx.get(ref),tx.get(claim)]);
        if(existing.exists)throw userError(409,'Deze personeelsfiche bestaat al');
        if(reserved.exists)throw userError(409,'Roepnummer reeds gereserveerd');
        const doc={dept:proposed.dept,discordId:proposed.discordId,
          name:proposed.name,call:proposed.call,rank:proposed.rank,
          status:'In opleiding',state:pending?'awaiting_discord':'linked',
          revision:0,createdByUid:req.bpd.uid,
          createdByDiscordId:req.bpd.discordId||null,
          entryRank:proposed.rank,
          exceptionalEntryRank:proposed.exceptionalRank,
          exceptionalEntryReason:proposed.exceptionReason,
          createdAt:FieldValue.serverTimestamp()};
        tx.create(ref,doc);
        tx.create(claim,{dept:proposed.dept,discordId:proposed.discordId,
          internalId:pending?ref.id:null,call:proposed.call,
          updatedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{action:'create',
          next:{name:proposed.name,call:proposed.call,rank:proposed.rank,
            status:'In opleiding'},revision:0,reason:proposed.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()});
        // Dedicated, immutable entry-rank event. Promotion events will use the
        // same old/new-rank vocabulary so career history remains chronological.
        tx.create(ref.collection('audit').doc(),{
          action:proposed.exceptionalRank?'exceptional_entry_rank':'entry_rank',
          previousRank:null,newRank:proposed.rank,
          standardRank:STANDARD_ENTRY_RANK[proposed.dept],
          exceptional:proposed.exceptionalRank,
          reason:proposed.exceptionalRank?proposed.exceptionReason:proposed.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()
        });
      });
      return res.status(201).json({created:true,pending,internalId:pending?ref.id:null,
        discordId:proposed.discordId,dept:proposed.dept});
    }catch(e){return safeResponse(res,e)}
  });
  // A verified member with an existing exact Discord-ID match in Sheets or
  // a Firestore personnel record is recognised automatically, without a new
  // registration, personnel mutation, role grant or cadre approval.
  app.get('/api/personnel/link/me',async(req,res)=>{
    if(!personnelDataEnabled(process.env))
      return error(res,503,'Personeelskoppeling is niet beschikbaar');
    try{
      const token=bearerToken(req.get('Authorization'));
      if(!token)return error(res,401,'Discord-aanmelding vereist');
      const decoded=await getAuth().verifyIdToken(token);
      const discordId=String(decoded.uid||'').replace(/^discord:/,'');
      if(!/^\d{15,22}$/.test(discordId))
        return error(res,403,'Discord-aanmelding vereist');
      const member=(await getFirestore().collection('bpd_discord_auth').doc(discordId).get()).data();
      if(verifiedLinkRequester(decoded,member,process.env.DISCORD_GUILD_ID)!==discordId)
        return error(res,403,'Vernieuw eerst je Discord-verificatie');
      const snap=await getSnapshot();
      const matches=snap.data.filter(p=>p.personId===discordId)
        .map(p=>({dept:p.dept,name:p.name,call:p.call,source:p.source==='firestore-created'?'firestore':'sheets'}));
      res.set('Cache-Control','no-store');
      return res.json({recognised:matches.length>0,personnel:matches});
    }catch(e){return safeResponse(res,e)}
  });
  // Self-service Discord proof: only the person currently authenticated through
  // the portal's OAuth flow can claim their own ID. Still requires cadre approval.
  app.post('/api/personnel/link/request',async(req,res)=>{
    if(!linkEnabled(process.env))
      return error(res,503,'Discord-koppeling is hier niet ingeschakeld');
    const internalId=req.body?.internalId;
    if(!validateLinkReference(internalId))return error(res,400,'Ongeldige interne personeelsreferentie');
    try{
      const token=bearerToken(req.get('Authorization'));
      if(!token)return error(res,401,'Meld je eerst aan met Discord');
      const decoded=await getAuth().verifyIdToken(token);
      const discordId=String(decoded.uid||'').replace(/^discord:/,'');
      if(!/^\d{15,22}$/.test(discordId))return error(res,403,'Gebruik een Discord-aanmelding');
      const store=getFirestore();
      const member=(await store.collection('bpd_discord_auth').doc(discordId).get()).data();
      if(verifiedLinkRequester(decoded,member,process.env.DISCORD_GUILD_ID)!==discordId)
        return error(res,403,'Vernieuw je Discord-aanmelding voordat je de koppeling aanvraagt');
      const ref=store.collection(PENDING_PERSONNEL_COLLECTION).doc(internalId);
      await store.runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists||doc.get('state')!=='awaiting_discord'||doc.get('discordId')!==null)
          throw userError(404,'Geen beschikbare personeelsfiche met deze referentie');
        const old=doc.get('linkRequest');
        if(old&&old.discordId!==discordId)
          throw userError(409,'Er is al een andere koppelaanvraag in behandeling');
        if(old?.state==='awaiting_approval')return;
        tx.update(ref,{linkRequest:{discordId,
          username:String(member.username||'Discord-lid').slice(0,80),
          verifiedAt:member.verifiedAt,state:'awaiting_approval',
          requestedAt:FieldValue.serverTimestamp()},
          updatedAt:FieldValue.serverTimestamp()});
      });
      return res.json({status:'awaiting_approval'});
    }catch(e){return safeResponse(res,e)}
  });
  // Explicit kader approval does not grant any Firebase/Discord module roles.
  app.post('/api/personnel/link/:internalId/approve',requireUser,async(req,res)=>{
    if(!linkEnabled(process.env))
      return error(res,503,'Discord-koppeling is hier niet ingeschakeld');
    if(!validateLinkReference(req.params.internalId))
      return error(res,400,'Ongeldige interne personeelsreferentie');
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(reason.length<10||reason.length>500)
      return error(res,400,'Een motivering van 10 tot 500 tekens is vereist');
    try{
      const store=getFirestore(),pending=store.collection(PENDING_PERSONNEL_COLLECTION)
        .doc(req.params.internalId);
      const check=await pending.get();
      if(!check.exists)return error(res,404,'Personeelsfiche niet gevonden');
      const record=check.data(),discordId=record.linkRequest?.discordId;
      if(!/^\d{15,22}$/.test(discordId))return error(res,409,'Geen koppelaanvraag ingediend');
      const member=(await store.collection('bpd_discord_auth').doc(discordId).get()).data();
      if(!mayApproveLink(req.bpd,record,member,process.env.DISCORD_GUILD_ID))
        return error(res,403,'Deze koppeling mag niet worden goedgekeurd of Discord moet opnieuw verifiëren');
      const snap=await getSnapshot({forceRefresh:true});
      if(snap.stale)return error(res,503,'De actuele personeelsbron kan niet worden gecontroleerd. Probeer later opnieuw.');
      const enrollment=checkServiceEnrollment(snap.data,record.dept,discordId);
      if(!enrollment.allowed)return error(res,409,enrollment.reason);
      if(snap.data.some(p=>p.dept===record.dept&&p.personId===discordId))
        return error(res,409,'Deze Discord-ID heeft al een personeelsfiche in deze hulpdienst');
      const created=store.collection(CREATED_PERSONNEL_COLLECTION).doc(record.dept+'_'+discordId);
      const claim=store.collection('bpd_personnel_call_claims')
        .doc(personnelCallClaimId(record.dept,record.call));
      await store.runTransaction(async tx=>{
        const [current,existing,reserved]=await Promise.all([
          tx.get(pending),tx.get(created),tx.get(claim)
        ]);
        if(!current.exists||existing.exists||
           !mayApproveLink(req.bpd,current.data(),member,process.env.DISCORD_GUILD_ID))
          throw userError(409,'De koppelaanvraag is gewijzigd of deze medewerker bestaat al');
        if(!reserved.exists||reserved.get('internalId')!==pending.id||
           reserved.get('discordId')!==null)
          throw userError(409,'De roepnummerreservering komt niet overeen');
        const d=current.data();
        tx.create(created,{dept:d.dept,discordId,internalId:pending.id,
          name:d.name,call:d.call,rank:d.rank,status:'In opleiding',
          entryRank:d.entryRank||d.rank,
          exceptionalEntryRank:d.exceptionalEntryRank===true,
          exceptionalEntryReason:d.exceptionalEntryReason||null,
          revision:0,state:'linked',createdAt:d.createdAt,
          linkedAt:FieldValue.serverTimestamp(),linkedByUid:req.bpd.uid});
        tx.update(pending,{state:'linked',discordId,linkedAt:FieldValue.serverTimestamp(),
          linkedByUid:req.bpd.uid,linkApprovedReason:reason});
        tx.update(claim,{discordId,internalId:null,updatedAt:FieldValue.serverTimestamp()});
        tx.create(created.collection('audit').doc(),{
          action:d.exceptionalEntryRank?'exceptional_entry_rank':'entry_rank',
          previousRank:null,newRank:d.rank,
          standardRank:STANDARD_ENTRY_RANK[d.dept],
          exceptional:d.exceptionalEntryRank===true,
          reason:d.exceptionalEntryRank?d.exceptionalEntryReason||'': 'Oorspronkelijk ingeschreven door bevoegd kaderlid',
          recordedAt:d.createdAt||null,
          recordedByUid:d.createdByUid||null,
          actorUid:d.createdByUid||null,actorDiscordId:d.createdByDiscordId||null,
          at:FieldValue.serverTimestamp()
        });
        tx.create(created.collection('audit').doc(),{
          action:'link_discord',previous:{discordId:null},next:{discordId},
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          reason,at:FieldValue.serverTimestamp()});
      });
      return res.json({linked:true,discordId,dept:record.dept});
    }catch(e){return safeResponse(res,e)}
  });
  // TEST-only administrative rejection. Leave the personnel draft and its call
  // reservation in place, but free the draft for another verified Discord user.
  // Rejections (including erroneous self-claims) are auditable and never grant roles.
  app.post('/api/personnel/link/:internalId/reject',requireUser,async(req,res)=>{
    if(!linkEnabled(process.env))
      return error(res,503,'Discord-koppeling is hier niet ingeschakeld');
    if(!validateLinkReference(req.params.internalId))
      return error(res,400,'Ongeldige interne personeelsreferentie');
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(reason.length<10||reason.length>500)
      return error(res,400,'Een motivering van 10 tot 500 tekens is vereist');
    try{
      const store=getFirestore();
      const pending=store.collection(PENDING_PERSONNEL_COLLECTION).doc(req.params.internalId);
      await store.runTransaction(async tx=>{
        const snapshot=await tx.get(pending);
        if(!snapshot.exists)throw userError(404,'Personeelsfiche niet gevonden');
        const record=snapshot.data();
        if(!mayRejectLink(req.bpd,record))
          throw userError(403,'Geen bevoegdheid of geen openstaande koppelaanvraag');
        tx.update(pending,{
          linkRequest:FieldValue.delete(),
          updatedAt:FieldValue.serverTimestamp()
        });
        tx.create(pending.collection('audit').doc(),{
          action:'reject_discord_link',
          previous:{discordId:record.linkRequest.discordId},
          next:{discordId:null},
          reason,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()
        });
      });
      return res.json({rejected:true,availableForNewRequest:true});
    }catch(e){return safeResponse(res,e)}
  });
  // Independent, fail-closed promotion register for newly created, linked police
  // records. Legacy Google Sheets ranks cannot be silently rewritten here.
  app.post('/api/personnel/:dept/:discordId/promote',requireUser,async(req,res)=>{
    const {dept,discordId}=req.params;
    if(dept!=='politie'||!validPersonnelKey(dept,discordId))
      return error(res,400,'Ongeldige politiepersoneelsfiche');
    if(!personnelDataEnabled(process.env)||
      process.env.BPD_ENABLE_PERSONNEL_RANK_CHANGES!=='true')
      return error(res,503,'Politiepromoties staan nog niet open');
    if(req.bpd.discordId===discordId||
      !canAuthoriseExceptionalPoliceRank(req.bpd,dept))
      return error(res,403,'Alleen bevoegde korpsleiding of beheerder kan een andere medewerker promoveren');
    let proposal;
    try{proposal=validatePolicePromotion(req.body)}
    catch(e){return error(res,400,e.message)}
    try{
      const store=getFirestore();
      const ref=store.collection(CREATED_PERSONNEL_COLLECTION).doc(dept+'_'+discordId);
      await store.runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists)
          throw userError(409,'Deze fiche is afkomstig uit Google Sheets en kan hier nog niet van rang veranderen');
        const data=current.data();
        const currentOverride=await tx.get(collection().doc(dept+'_'+discordId));
        if(currentOverride.get('approvedRankEdit')===true)
          throw userError(409,'Deze fiche gebruikt de nieuwe rangwijzigingsmodule. Vernieuw het dossier.');
        if(data.dept!==dept||data.discordId!==discordId||data.state!=='linked')
          throw userError(409,'De personeelsfiche is niet volledig gekoppeld');
        if(data.rank!==proposal.expectedRank||
          nextPoliceRank(data.rank)!==proposal.newRank)
          throw userError(409,'De rang is intussen gewijzigd. Vernieuw eerst de personeelsfiche');
        tx.update(ref,{rank:proposal.newRank,
          rankUpdatedAt:FieldValue.serverTimestamp(),
          rankUpdatedByUid:req.bpd.uid,
          rankUpdatedByDiscordId:req.bpd.discordId||null});
        tx.create(ref.collection('audit').doc(),{
          action:'promotion',
          previousRank:data.rank,newRank:proposal.newRank,
          reason:proposal.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()
        });
        tx.create(store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
          type:'promotion',dept,discordId,
          name:String(data.name||'Personeelslid').slice(0,120),
          before:data.rank,after:proposal.newRank,
          at:FieldValue.serverTimestamp()
        });
      });
      return res.json({promoted:true,dept,discordId,newRank:proposal.newRank,
        rolesGranted:false,sourceSheetsChanged:false});
    }catch(e){return safeResponse(res,e)}
  });
  // Audited personnel grade and callsign change. Sheets stay untouched; the
  // effective view uses the approved Firestore overlay. Never changes Discord
  // roles, operational authorization or the subject's own account claims.
  app.post('/api/personnel/:dept/:discordId/rank-change',requireDossierUser,async(req,res)=>{
    const {dept,discordId}=req.params;
    if(dept!=='politie'||!validPersonnelKey(dept,discordId))
      return error(res,400,'Ongeldige politiepersoneelsfiche');
    if(!personnelDataEnabled(process.env)||!writes()||
       process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE!=='true'||
       process.env.BPD_ENABLE_PERSONNEL_RANK_CHANGES!=='true')
      return error(res,503,'Rangwijzigingen zijn nog niet geactiveerd in deze omgeving');
    let proposal;
    try{proposal=validatePoliceGradeChange(req.body)}
    catch(e){return error(res,400,e.message)}
    try{
      const snap=await getSnapshot({forceRefresh:true});
      if(snap.stale)throw userError(503,'Personeelsbron is niet actueel');
      const matches=snap.data.filter(p=>p.dept===dept&&p.personId===discordId);
      if(matches.length!==1)throw userError(409,'Personeelsfiche is niet eenduidig');
      const subject=matches[0];
      if(!canChangePoliceGrade(req.bpd,subject))
        throw userError(403,'Geen rangbevoegdheid voor dit personeelslid');
      if(!allowedPoliceGradeChoices(req.bpd).includes(proposal.newRank))
        throw userError(403,'Deze nieuwe rang valt buiten jouw kaderbevoegdheid');
      if(proposal.expectedRank!==subject.rank)
        throw userError(409,'De huidige rang is gewijzigd. Vernieuw de fiche.');
      if(snap.data.some(p=>p.dept===dept&&p.personId!==discordId&&
          String(p.call).trim().toLowerCase()===proposal.newCall.toLowerCase()))
        throw userError(409,'Het nieuwe roepnummer is al in gebruik');
      const store=getFirestore(),ref=collection().doc(dept+'_'+discordId);
      const claims=store.collection('bpd_personnel_call_claims');
      const newClaim=claims.doc(personnelCallClaimId(dept,proposal.newCall));
      const oldClaim=claims.doc(personnelCallClaimId(dept,subject.call));
      const type=classifyPoliceGradeChange(subject.call,proposal.newCall);
      await store.runTransaction(async tx=>{
        const [current,reserved,previousClaim]=await Promise.all([
          tx.get(ref),tx.get(newClaim),
          newClaim.id===oldClaim.id?tx.get(newClaim):tx.get(oldClaim)
        ]);
        const saved=current.data()||{},revision=saved.revision||0;
        if(revision!==proposal.expectedRevision)
          throw userError(409,'Deze fiche werd intussen gewijzigd. Vernieuw de pagina.');
        if(saved.approvedRankEdit===true&&saved.rank!==subject.rank)
          throw userError(409,'Rang is intussen gewijzigd. Vernieuw de fiche.');
        if(reserved.exists&&reserved.get('discordId')!==discordId)
          throw userError(409,'Het nieuwe roepnummer is reeds gereserveerd');
        const oldRank=subject.rank,oldCall=subject.call;
        const next={name:saved.name??subject.name,call:proposal.newCall,
          status:saved.status??subject.status};
        tx.set(ref,{...next,dept,discordId,revision:revision+1,
          rank:proposal.newRank,approvedRankEdit:true,
          updatedAt:FieldValue.serverTimestamp(),updatedByUid:req.bpd.uid,
          updatedByDiscordId:req.bpd.discordId});
        tx.set(newClaim,{dept,discordId,call:proposal.newCall,
          updatedAt:FieldValue.serverTimestamp()});
        if(oldClaim.id!==newClaim.id&&previousClaim.exists&&
           previousClaim.get('discordId')===discordId)tx.delete(oldClaim);
        tx.create(ref.collection('audit').doc(),{
          action:type==='promotion'?'promotion':type==='demotion'?'demotion':'rank_change',
          previousRank:oldRank,newRank:proposal.newRank,
          previousCall:oldCall,newCall:proposal.newCall,
          reason:proposal.reason,revision:revision+1,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()
        });
        tx.create(store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
          type,dept,discordId,name:next.name,before:oldRank,after:proposal.newRank,
          previousCall:oldCall,newCall:proposal.newCall,
          reason:proposal.reason,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()
        });
        if(oldCall!==proposal.newCall)
          tx.create(store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
            type:'callsign_changed',rankMovement:true,dept,discordId,name:next.name,
            before:oldCall,after:proposal.newCall,reason:proposal.reason,
            actorDiscordId:req.bpd.discordId,at:FieldValue.serverTimestamp()
          });
      });
      res.set('Cache-Control','no-store');
      return res.json({saved:true,type,newRank:proposal.newRank,newCall:proposal.newCall,
        sourceSheetsChanged:false,discordRoleChanged:false,
        requiresDiscordRoleReview:true,revision:proposal.expectedRevision+1});
    }catch(e){return safeResponse(res,e)}
  });
  app.post('/api/personnel/:dept/:discordId/name',requireDossierUser,async(req,res)=>{
    const {dept,discordId}=req.params;
    if(!validPersonnelKey(dept,discordId))return error(res,400,'Ongeldige personeelsreferentie');
    if(!writes())return error(res,503,'Personeelswijzigingen staan nog uit');
    let data;
    try{data=validateLowerPoliceRename(req.body)}catch(e){return error(res,400,e.message)}
    try{
      const snap=await getSnapshot();
      if(snap.stale)throw userError(503,'Personeelsbron moet eerst opnieuw synchroniseren');
      const matches=snap.data.filter(p=>p.dept===dept&&p.personId===discordId);
      if(matches.length!==1)throw userError(409,'Geen eenduidige personeelsfiche');
      const subject=matches[0];
      if(!canRenameLowerPolice(req.bpd,subject))
        throw userError(403,'Middenkader mag alleen namen van lager politiekader aanpassen');
      const ref=collection().doc(dept+'_'+discordId);
      await getFirestore().runTransaction(async tx=>{
        const current=await tx.get(ref);
        const saved=current.data();
        const revision=saved?.revision||0;
        if(revision!==data.expectedRevision)
          throw userError(409,'De fiche is gewijzigd. Vernieuw voor je opnieuw opslaat');
        const oldName=saved?.name??subject.name;
        if(oldName===data.name)throw userError(409,'De naam is niet gewijzigd');
        const previous={name:oldName,call:saved?.call??subject.call,status:saved?.status??subject.status};
        const next={...previous,name:data.name};
        tx.set(ref,{...next,
          ...(saved?.approvedRankEdit===true?{rank:saved.rank,approvedRankEdit:true}:{}),
          dept,discordId,revision:revision+1,
          updatedAt:FieldValue.serverTimestamp(),updatedByUid:req.bpd.uid,
          updatedByDiscordId:req.bpd.discordId});
        tx.create(ref.collection('audit').doc(),{action:'name_changed',
          previous,next,revision:revision+1,reason:data.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()});
        tx.create(getFirestore().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
          type:'name_changed',dept,discordId,name:data.name,
          before:oldName,after:data.name,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()
        });
      });
      return res.json({saved:true,active:process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true'});
    }catch(e){return safeResponse(res,e)}
  });
  app.post('/api/personnel/:dept/:discordId',requireDossierUser,async(req,res)=>{
    if(!validPersonnelKey(req.params.dept,req.params.discordId))return error(res,400,'Ongeldige hulpdienst of Discord ID');
    if(!writes())return error(res,503,'Personeelswijzigingen staan nog uit. Test de module eerst veilig.');
    let proposed;
    try{proposed=validatePersonnelChange(req.body);}catch(e){return error(res,400,e.message)}
    try{
      const snap=await getSnapshot();
      const matches=snap.data.filter(p=>p.dept===req.params.dept&&p.personId===req.params.discordId);
      if(matches.length!==1)throw userError(409,'Geen eenduidige bestaande personeelsfiche gevonden');
      const subject=matches[0];
      if(!canReadPersonnelSubject(req.bpd,subject))throw userError(403,'Dossier van Korpsleiding is afgeschermd');
      if(!canEditGeneralPersonnelInfo(req.bpd,subject))
        throw userError(403,'Alleen bevoegd Officierenkader, Korpsleiding of geverifieerd Bestuur mag algemene personeelsinformatie wijzigen');
      if(snap.data.some(p=>p.dept===subject.dept&&p.personId!==subject.personId&&
        p.call===proposed.call))throw userError(409,'Dit roepnummer wordt al gebruikt binnen deze hulpdienst');
      if(subject.name===proposed.name&&subject.call===proposed.call&&subject.status===proposed.status)
        throw userError(409,'Er zijn geen wijzigingen ten opzichte van de huidige personeelsfiche');
      const ref=collection().doc(subject.dept+'_'+subject.personId);
      await getFirestore().runTransaction(async tx=>{
        const existing=await tx.get(ref);
        const current=existing.exists?existing.data():null;
        const revision=current?.revision||0;
        if(revision!==proposed.expectedRevision)throw userError(409,'Deze fiche is intussen gewijzigd. Vernieuw de pagina.');
        const oldCall=current?.call??subject.call;
        const claims=getFirestore().collection('bpd_personnel_call_claims');
        const newClaim=claims.doc(personnelCallClaimId(subject.dept,proposed.call));
        const oldClaim=claims.doc(personnelCallClaimId(subject.dept,oldCall));
        const reserved=await tx.get(newClaim);
        if(reserved.exists&&reserved.get('discordId')!==subject.personId)
          throw userError(409,'Dit roepnummer is intussen gereserveerd voor een ander personeelslid');
        const previousClaim=oldCall===proposed.call?reserved:await tx.get(oldClaim);
        const audit=ref.collection('audit').doc();
        const previous={name:current?.name??subject.name,call:oldCall,status:current?.status??subject.status};
        const next={name:proposed.name,call:proposed.call,status:proposed.status};
        tx.set(ref,{...next,
          ...(current?.approvedRankEdit===true?{rank:current.rank,approvedRankEdit:true}:{}),
          dept:subject.dept,discordId:subject.personId,revision:revision+1,
          updatedAt:FieldValue.serverTimestamp(),updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId});
        tx.set(newClaim,{discordId:subject.personId,dept:subject.dept,call:proposed.call,updatedAt:FieldValue.serverTimestamp()});
        if(oldCall!==proposed.call&&previousClaim.exists&&previousClaim.get('discordId')===subject.personId)
          tx.delete(oldClaim);
        tx.create(audit,{previous,next,revision:revision+1,reason:proposed.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()});
        if(oldCall!==proposed.call){
          tx.create(getFirestore().collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
            type:'callsign_changed',dept:subject.dept,discordId:subject.personId,
            name:proposed.name,before:oldCall,after:proposed.call,
            at:FieldValue.serverTimestamp()
          });
        }
      });
      return res.json({ok:true,status:'saved',active:process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true'});
    }catch(e){return safeResponse(res,e)}
  });
  app.get('/api/personnel/:dept/:discordId/history',requireDossierUser,async(req,res)=>{
    if(!validPersonnelKey(req.params.dept,req.params.discordId))return error(res,400,'Ongeldige hulpdienst of Discord ID');
    if(!canReadServiceDossier(req.bpd,req.params.dept))return error(res,403,'Geen toegang tot dit dienstdossier');
    try{
      const snap=await getSnapshot();
      const target=snap.data.find(p=>p.dept===req.params.dept&&p.personId===req.params.discordId);
      if(!target)return error(res,404,'Personeelsfiche niet gevonden');
      if(!canReadPersonnelSubject(req.bpd,target))return error(res,403,'Dossier van Korpsleiding is afgeschermd');
      const key=req.params.dept+'_'+req.params.discordId;
      const editLog=collection().doc(key).collection('audit');
      const createLog=getFirestore().collection(CREATED_PERSONNEL_COLLECTION)
        .doc(key).collection('audit');
      const [edits,created]=await Promise.all([
        editLog.orderBy('at','desc').limit(25).get(),
        personnelDataEnabled(process.env)
          ?createLog.orderBy('at','desc').limit(25).get():Promise.resolve({docs:[]})
      ]);
      const allowedActorDepartments=Array.isArray(req.bpd.dossierAllowedDepartments)?
        req.bpd.dossierAllowedDepartments:[req.params.dept];
      const changes=[...edits.docs,...created.docs].map(d=>{
        const e=d.data(),actorId=e.actorDiscordId||e.byDiscordId||null;
        return {action:e.action||'edit',revision:e.revision,
          previous:e.previous||null,next:e.next||null,
          previousRank:e.previousRank??null,newRank:e.newRank??null,
          standardRank:e.standardRank??null,exceptional:e.exceptional===true,
          reason:e.reason||'',at:asTime(e.at),actorDiscordId:actorId,
          actorCurrent:currentPersonnelAuditActor(actorId,req.params.dept,
            snap.data,allowedActorDepartments)};
      }).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,25);
      return res.json({changes,actorRosterFetchedAt:snap.fetchedAt,
        actorRosterStale:snap.stale===true});
    }catch(e){return safeResponse(res,e)}
  });
}
