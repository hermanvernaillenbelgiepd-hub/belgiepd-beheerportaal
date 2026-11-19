import {getFirestore,FieldValue,Timestamp} from 'firebase-admin/firestore';
import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {canRetireDossierRecord} from './dossier-retirement-policy.js';
import {actorFromPersonnel,representativeFromPersonnel} from './registrations.js';
import {HISTORICAL_OBSERVATION_SETTINGS,HISTORICAL_OBSERVATION_DOC,
 historicalMigrationSettings,historicalMigrationAllowed,validateHistoricalActorSelection}
 from './historical-observation-import-policy.js';
import {createWeekReportDocx} from './report-export.js';
import {PERSONNEL_DECORATIONS_COLLECTION,PERSONNEL_DECORATION_CATALOG_COLLECTION,
 CATALOG_BY_ID,decorationCatalogExtras,expirationDate} from './personnel-decoration-policy.js';
import {isArchivedTraining} from './training-maintenance.js';
import {projectLeaveReportEvent} from './leave-report-projection.js';
import {brusselsEventDate} from './personnel-event-date.js';
import {INACTIVITY_PING_NOTICES,inactivityPingNotice,publicPingNotice,validPingId} from './inactivity-ping-notifications.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {staffActivityFollowup} from './staff-activity-followup.js';
import {automaticFortnightReports,parseAutomaticReportId,mayReadFortnightReport,fortnightReportDepartments,mayRemoveWeekReport,splitReportsByPeriod,isCurrentAutomaticReport,visibleFortnightReports,includedAfterReportRestart,isVerifiedReportTechnicalAdmin} from './fortnight-report-policy.js';
import {verifiedBoardCorpsDossierAdmin} from './board-corps-dossier-policy.js';
import {CADRE_ROLES, MANAGEMENT_TYPES, RECORD_LABELS,mayReadManagement,mayWriteManagement,uniqueSubject,validDiscord,validateManagementEntry,validateWeekReport,reportSections,safeReportId,mayClassifyTest,isTestRecord,validateTestClassification,mayExportWeekReport,mayCorrectManualCase} from './management-utils.js';
const asString=x=>String(x??'').trim();
const toIso=t=>t?.toDate?.().toISOString()||null;
const caseId=(dept,id)=>`${dept}_${id}`;
const noPrivate=e=>{
  const {submittedBy,submittedByActor,createdAt,modifiedAt,...other}=e;
  const importedBy=e.historicalImport===true&&submittedByActor?{
    name:String(submittedByActor.name||'').slice(0,120),
    call:String(submittedByActor.call||'').slice(0,24)}:null;
  return {...other,...(importedBy?{importedBy}:{}),
    createdAt:toIso(createdAt),modifiedAt:toIso(modifiedAt)};
};
const errorResponse=(res,error)=>{
  if(/^(Ongeldig|Ongeldige|Omschrijving|Rapporttitel|Rapportperiode|Einddatum|Naam van|Nieuwe naam|Voorgestelde graad|Personeelsbeweging|Datum|Begindatum|Hulpdienst)/.test(error?.message||''))return res.status(400).json({error:error.message});
  console.error('Weekrapport/dossierfout:',error?.code||error?.message||'onbekend');
  return res.status(503).json({error:'Interne dossier- of weekrapportopslag tijdelijk niet beschikbaar'});
};
export function installManagementRoutes(app,{requireUser,requireMemberUser=requireUser,getSnapshot}){
  const db=()=>getFirestore();
  const enabled=()=>process.env.BPD_ENABLE_REGISTRATIONS==='true' && process.env.BPD_ENABLE_MANAGEMENT_WRITES==='true';
  // Technical profile is a signed, allowlisted, authenticated Discord session.
  // When its owner has no separate personnel record, audit using their verified
  // Discord ID instead of blocking the approved technical report operation.
  const reportAuditActor=(request,roster)=>actorFromPersonnel(request.bpd,roster)||
    (isVerifiedReportTechnicalAdmin(request.bpd)?{
      discordId:request.bpd.discordId,name:'Technisch Beheer',
      call:'—',rank:'Technisch beheer',dept:'algemeen'}:null);
  const cadre=(req,res,next)=>{
    if(req.bpd.portalTechnicalMode!==true&&req.bpd.fireZoneChief!==true&&!CADRE_ROLES.includes(req.bpd.role)&&!req.bpd.dossierFullDepartments?.length)return res.status(403).json({error:'Alleen middenkader en hoger hebben toegang'});
    next();
  };
  app.get('/api/management/overview',requireUser,async(req,res)=>{
    try{
      const snap=await getSnapshot();
      const subjects=snap.data.filter(p=>canReadServiceDossier(req.bpd,p.dept)).map(p=>({dept:p.dept,discordId:p.personId,name:p.name,call:p.call,rank:p.rank}));
      const actor=actorFromPersonnel(req.bpd,snap.data);
      res.json({role:req.bpd.role,departments:req.bpd.dossierAllowedDepartments.filter(d=>canReadServiceDossier(req.bpd,d)),reportDepartments:fortnightReportDepartments(req.bpd,snap.data).filter(d=>canReadServiceDossier(req.bpd,d)),writesEnabled:enabled()&&req.bpd.dossierAllowedDepartments.some(d=>MANAGEMENT_TYPES.some(t=>mayWriteManagement(req.bpd,d,t))),canClassifyTests:req.bpd.dossierNativeDepartments.some(d=>mayClassifyTest(req.bpd,d)),canExportReports:fortnightReportDepartments(req.bpd,snap.data).filter(d=>canReadServiceDossier(req.bpd,d)).length>0,removeReportDepartments:enabled()?fortnightReportDepartments(req.bpd,snap.data).filter(d=>canReadServiceDossier(req.bpd,d)&&mayRemoveWeekReport(req.bpd,d,snap.data)):[],actor,subjects,types:MANAGEMENT_TYPES.filter(t=>req.bpd.dossierAllowedDepartments.some(d=>mayWriteManagement(req.bpd,d,t))),
        typesByDepartment:Object.fromEntries(req.bpd.dossierAllowedDepartments
          .filter(d=>canReadServiceDossier(req.bpd,d))
          .map(d=>[d,MANAGEMENT_TYPES.filter(t=>mayWriteManagement(req.bpd,d,t))]))});
    }catch(e){errorResponse(res,e)}
  });

  // Management follow-up is based on the ACTUAL roster status and must never
  // be presented as evidence of a sent ping. Scope each row with the same
  // service/dossier restrictions as the personnel management screen.
  app.get('/api/management/activity-followup',requireUser,async(req,res)=>{
    try{
      const snapshot=await getSnapshot();
      if(snapshot.stale||!Array.isArray(snapshot.data))
        return res.status(503).json({error:'Actuele personeelsbron niet beschikbaar; opvolging tijdelijk niet zichtbaar'});
      const result=staffActivityFollowup(req.bpd,snapshot.data);
      if(!result.allowed)
        return res.status(403).json({error:'Geen toegang tot personeelsopvolging'});
      res.set('Cache-Control','private, no-store');
      return res.json(result);
    }catch(e){return errorResponse(res,e)}
  });

  app.get('/api/management/cases',requireUser,async(req,res)=>{
    const dept=asString(req.query.dept),id=asString(req.query.discordId);
    if(!canReadServiceDossier(req.bpd,dept))return res.status(403).json({error:'Geen dossierrechten'});
    if(!validDiscord(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const snap=await getSnapshot(),subject=uniqueSubject(snap.data,dept,id);
      if(!subject)return res.status(404).json({error:'Personeelsfiche niet eenduidig gevonden'});
      if(!canReadPersonnelSubject(req.bpd,subject))return res.status(403).json({error:'Dit personeelsdossier is beschermd'});
      const rows=await db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').orderBy('createdAt','desc').limit(150).get();
      res.json({subject:{dept,discordId:id,name:subject.name,call:subject.call},
        entries:rows.docs.filter(d=>d.get('status')!=='verwijderd').map(d=>({
          id:d.id,...noPrivate(d.data()),
          canAmend:enabled()&&mayCorrectManualCase(req.bpd,subject,d.data())
        })),limited:rows.docs.length===150});
    }catch(e){errorResponse(res,e)}
  });
  // Narrow self-note exception: verified 900/910 Korpsleiding can append
  // an own note without gaining access to any other protected dossier.
  const ownCorpsNoteSubject=async actor=>{
    const id=actor?.discordId;
    if(!validDiscord(id)||actor?.uid!=='discord:'+id||
      actor?.portalTechnicalMode===true||actor?.role!=='korpsleiding'||
      roleForDepartment(actor,'politie')!=='korpsleiding'||
      !(actor?.discordPoliceRank==='korpsleiding'||actor?.manualCorpsApproved===true))
      return null;
    const snap=await getSnapshot();
    if(snap.stale)return null;
    const subject=uniqueSubject(snap.data,'politie',id);
    const call=String(subject?.call||'').trim();
    return /^(?:(?:SANTO|S)[- ]?)?(?:900|910)$/i.test(call)?subject:null;
  };
  app.get('/api/management/corps-note/me',requireUser,async(req,res)=>{
    try{
      const subject=await ownCorpsNoteSubject(req.bpd);
      if(!subject)return res.status(403).json({error:'Eigen korpsnotities uitsluitend voor geverifieerde 900/910'});
      res.set('Cache-Control','private, no-store');
      return res.json({allowed:true,subjectCall:subject.call,writesEnabled:enabled()});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/corps-note/me',requireUser,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Dossierregistraties staan momenteel uit'});
    try{
      const subject=await ownCorpsNoteSubject(req.bpd);
      if(!subject)return res.status(403).json({error:'Geen bevoegdheid voor een eigen korpsnotitie'});
      const details=String(req.body?.details||'').trim();
      if(details.length<10||details.length>4000||Object.keys(req.body||{}).some(k=>k!=='details'))
        return res.status(400).json({error:'Geef uitsluitend een eigen notitie van 10–4000 tekens'});
      const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
        year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const entryData=validateManagementEntry({type:'notitie',eventDate:date,details});
      const actor=actorFromPersonnel(req.bpd,[subject]);
      if(!actor)return res.status(403).json({error:'Niet eenduidig gekoppeld aan je politiefiche'});
      const item=db().collection('bpd_cases').doc(caseId('politie',subject.personId))
        .collection('entries').doc();
      const notice=db().collection('bpd_notices').doc('politie').collection('events').doc();
      const batch=db().batch(),now=FieldValue.serverTimestamp();
      batch.create(item,{...entryData,dept:'politie',subjectDiscordId:subject.personId,
        subjectNameAtCreation:subject.name,subjectCallAtCreation:subject.call,
        ownCorpsNote:true,registeredBy:actor,submittedBy:{uid:req.bpd.uid},
        createdAt:now,modifiedAt:null});
      batch.create(notice,{caseId:caseId('politie',subject.personId),
        entryId:item.id,type:'notitie',dept:'politie',createdAt:now});
      await batch.commit();
      res.set('Cache-Control','private, no-store');
      return res.status(201).json({saved:true,reference:item.id});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/cases',requireUser,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Opslag staat uit; stel BPD_ENABLE_MANAGEMENT_WRITES=true in na controle'});
    const dept=asString(req.body?.dept),id=asString(req.body?.discordId),type=asString(req.body?.type);
    if(!canReadServiceDossier(req.bpd,dept)||!mayWriteManagement(req.bpd,dept,type))return res.status(403).json({error:'Geen bevoegdheid om deze categorie te registreren'});
    if(!validDiscord(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    if(verifiedBoardCorpsDossierAdmin(req.bpd)&&id===req.bpd.discordId)
      return res.status(403).json({error:'Dossierregistraties over jezelf zijn niet toegestaan'});
    try{
      const data=validateManagementEntry(req.body),snap=await getSnapshot();
      const subject=uniqueSubject(snap.data,dept,id);
      if(!subject)return res.status(404).json({error:'Personeelsfiche niet eenduidig gevonden'});
      if(!canReadPersonnelSubject(req.bpd,subject))return res.status(403).json({error:'Dit personeelsdossier is beschermd'});
      const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Koppel je Google-account eerst aan je eigen Discord ID'});
      const representedId=asString(req.body?.onBehalfOfDiscordId);
      let represented=null,onBehalfReason='';
      if(representedId){
        const config=await db().collection(HISTORICAL_OBSERVATION_SETTINGS)
          .doc(HISTORICAL_OBSERVATION_DOC).get();
        if(!historicalMigrationAllowed(req.bpd,dept,type,historicalMigrationSettings(config.data()))||
          !['notitie','algemene_notitie','inactiviteitsping'].includes(type))
          return res.status(403).json({error:'Historische overname is uitgeschakeld of niet toegestaan'});
        try{onBehalfReason=validateHistoricalActorSelection(
          representedId,req.body.onBehalfReason,req.bpd.discordId).reason}
        catch(e){return res.status(400).json({error:e.message})}
        if(data.eventDate>brusselsEventDate())
          return res.status(400).json({error:'Een historische registratie kan niet in de toekomst liggen'});
        represented=representativeFromPersonnel(snap.data,dept,representedId);
        if(!represented)return res.status(400).json({error:'Oorspronkelijke registrator niet gevonden in de personeelslijst'});
      }
      const newDoc=db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').doc();
      const notice=db().collection('bpd_notices').doc(dept).collection('events').doc();
      const batch=db().batch();
      batch.create(newDoc,{...data,dept,subjectDiscordId:id,subjectNameAtCreation:subject.name,subjectCallAtCreation:subject.call,registeredBy:represented||actor,submittedByActor:actor,
        onBehalfOf:represented||null,onBehalfReason,
        historicalImport:Boolean(represented),importSource:represented?'spreadsheet':null,
        submittedBy:{uid:req.bpd.uid,email:req.bpd.email},
        ...(type==='inactiviteitsping'?(represented?{
          historicalPing:true,pingNotificationStatus:'historisch'
        }:{pingNotificationId:newDoc.id,pingNotificationStatus:'sent'}):{}),
        createdAt:FieldValue.serverTimestamp(),modifiedAt:null});
      batch.create(notice,{caseId:caseId(dept,id),entryId:newDoc.id,type,dept,createdAt:FieldValue.serverTimestamp()});
      // Exactly one atomic record is shared between the member inbox,
      // source dossier and dynamic fortnight report. No Discord DM is sent.
      if(type==='inactiviteitsping'&&!represented){
        const ping=db().collection(INACTIVITY_PING_NOTICES).doc(id).collection('events').doc(newDoc.id);
        batch.create(ping,{...inactivityPingNotice({dept,discordId:id,entryId:newDoc.id,
          details:data.details,actor}),createdAt:FieldValue.serverTimestamp(),readAt:null});
      }
      await batch.commit();
      res.status(201).json({saved:true,reference:newDoc.id});
    }catch(e){errorResponse(res,e)}
  });
  // Alleen manuele dossiernotities van een ondergeschikte kunnen gecorrigeerd
  // worden: niet de echte verlof-, rang-, sanctie- of promotiebeslissingen.
  app.patch('/api/management/cases/:dept/:discordId/:entryId',requireUser,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Dossierregistraties staan momenteel uit'});
    const {dept,discordId:id,entryId}=req.params;
    if(dept!=='politie'||!validDiscord(id)||!/^[A-Za-z0-9_-]{12,120}$/.test(entryId))
      return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    const reason=typeof req.body?.amendmentReason==='string'?req.body.amendmentReason.trim():'';
    if(reason.length<10||reason.length>1000)
      return res.status(400).json({error:'Vermeld een motivering van 10 tot 1000 tekens'});
    if(!Object.hasOwn(req.body||{},'expectedModifiedAt')||
      req.body.expectedModifiedAt!==null&&(
        typeof req.body.expectedModifiedAt!=='string'||
        !Number.isFinite(Date.parse(req.body.expectedModifiedAt))))
      return res.status(400).json({error:'Vernieuw eerst het dossier'});
    try{
      const snapshot=await getSnapshot();
      if(snapshot.stale)return res.status(503).json({error:'Personeelsgegevens zijn niet actueel'});
      const subject=uniqueSubject(snapshot.data,dept,id);
      if(!subject)return res.status(404).json({error:'Personeelslid niet gevonden'});
      const actor=actorFromPersonnel(req.bpd,snapshot.data);
      if(!actor)return res.status(403).json({error:'Eigen identiteit is niet geverifieerd'});
      if(!canRetireDossierRecord(req.bpd,subject))
        return res.status(403).json({error:'Alleen bevoegd Officierenkader of Korpsleiding mag registraties van ondergeschikten corrigeren'});
      const store=db(),entries=store.collection('bpd_cases').doc(caseId(dept,id)).collection('entries');
      const ref=entries.doc(entryId),audit=ref.collection('audit').doc(),report=entries.doc();
      const notice=store.collection('bpd_notices').doc(dept).collection('events').doc();
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
        year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      await store.runTransaction(async tx=>{
        const existing=await tx.get(ref);
        if(!existing.exists)throw Object.assign(Error('Dossierregistratie niet gevonden'),{status:404});
        const old=existing.data();
        if(!mayCorrectManualCase(req.bpd,subject,old))
          throw Object.assign(Error('Deze registratie mag niet gewijzigd worden; controleer dossier, type en bevoegdheid'),{status:403});
        if((toIso(old.modifiedAt)||null)!==req.body.expectedModifiedAt)
          throw Object.assign(Error('Deze registratie is intussen gewijzigd. Vernieuw het dossier.'),{status:409});
        if(req.body.type!==old.type)
          throw Object.assign(Error('Het oorspronkelijke registratietype mag niet wijzigen'),{status:400});
        let values;
        try{
          const parsed=validateManagementEntry({...req.body,type:old.type});
          values={...parsed,referenceUrl:parsed.referenceUrl||''};
        }
        catch(e){throw Object.assign(e,{status:400})}
        const before=Object.fromEntries(Object.keys(values).map(key=>[key,old[key]??null]));
        if(Object.keys(values).every(key=>JSON.stringify(old[key]??null)===JSON.stringify(values[key])))
          throw Object.assign(Error('Er zijn geen gewijzigde gegevens'),{status:400});
        const at=FieldValue.serverTimestamp();
        tx.update(ref,{...values,modifiedAt:at,modifiedBy:actor});
        tx.create(audit,{action:'manual_case_amended',before,after:values,
          reason,by:actor,byUid:req.bpd.uid,at});
        tx.create(report,{type:'activiteit',reportCategory:'activiteit',dept,
          subjectDiscordId:id,subjectNameAtCreation:subject.name,
          subjectCallAtCreation:subject.call,eventDate:today,registeredBy:actor,
          source:'case-amendment',amendmentOf:{entryId,kind:old.type},
          details:'CORRECTIE DOSSIERREGISTRATIE · '+entryId+
            ' · Motivering: '+reason+' · Door '+actor.name,
          createdAt:at,modifiedAt:null});
        tx.create(notice,{caseId:caseId(dept,id),entryId:report.id,
          type:'activiteit',action:'manual_case_amended',originalEntryId:entryId,
          dept,createdAt:at});
      });
      return res.json({saved:true,auditRecorded:true,reportLogged:true});
    }catch(e){
      if([400,403,404,409].includes(e?.status))
        return res.status(e.status).json({error:e.message});
      return errorResponse(res,e)
    }
  });
  app.get('/api/management/cases/:dept/:discordId/:entryId/audit',requireUser,async(req,res)=>{
    const {dept,discordId:id,entryId}=req.params;
    if(dept!=='politie'||!validDiscord(id)||!/^[A-Za-z0-9_-]{12,120}$/.test(entryId))
      return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    try{
      const snapshot=await getSnapshot(),subject=uniqueSubject(snapshot.data,dept,id);
      if(!subject)return res.status(404).json({error:'Personeelslid niet gevonden'});
      const ref=db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').doc(entryId);
      const doc=await ref.get();
      if(!doc.exists)return res.status(404).json({error:'Registratie niet gevonden'});
      if(!mayCorrectManualCase(req.bpd,subject,doc.data()))
        return res.status(403).json({error:'Geen recht om deze correctiehistoriek te bekijken'});
      const history=await ref.collection('audit').orderBy('at','desc').limit(40).get();
      res.set('Cache-Control','private, no-store');
      return res.json({changes:history.docs.filter(d=>d.get('action')==='manual_case_amended').map(d=>{
        const val=d.data();
        return {at:toIso(val.at),reason:String(val.reason||'').slice(0,1000),
          actor:{name:String(val.by?.name||'Onbekend'),call:String(val.by?.call||'')},
          before:{eventDate:val.before?.eventDate||null,
            details:String(val.before?.details||'').slice(0,4000),
            courseName:val.before?.courseName||null,
            referenceUrl:val.before?.referenceUrl||null,
            proposedRank:val.before?.proposedRank||null,
            newName:val.before?.newName||null,
            movement:val.before?.movement||null}};
      }),limited:history.docs.length===40});
    }catch(e){return errorResponse(res,e)}
  });
  // Police decorations nominations have an independent review queue.
  // An approved proposal is NOT automatically an awarded medal.
  const mayReviewNominations=actor=>Boolean(isVerifiedReportTechnicalAdmin(actor)||
    (actor?.uid==='discord:'+actor?.discordId&&
    actor?.portalTechnicalMode!==true&&actor?.departments?.includes('politie')&&
    ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'politie'))&&
    actor?.dossierNativeDepartments?.includes('politie')&&
    actor?.dossierAllowedDepartments?.includes('politie')));
  app.get('/api/management/award-nominations',requireUser,async(req,res)=>{
    if(!mayReviewNominations(req.bpd))return res.status(403).json({error:'Alleen politie Officierenkader en Korpsleiding beoordelen voordrachten'});
    try{
      const snapshot=await getSnapshot();
      if(snapshot.stale)return res.status(503).json({error:'Personeelsbron niet actueel'});
      const notices=await db().collection('bpd_notices').doc('politie')
        .collection('events').orderBy('createdAt','desc').limit(350).get();
      const ids=notices.docs.filter(d=>d.get('type')==='voordracht_ereteken')
        .slice(0,90).map(d=>({
          caseId:String(d.get('caseId')||''),
          entryId:String(d.get('entryId')||'')
        })).filter(e=>/^politie_\d{15,22}$/.test(e.caseId)&&
          /^[A-Za-z0-9]{10,40}$/.test(e.entryId));
      const allowed=ids.map(e=>{
        const discordId=e.caseId.slice(8);
        const subject=uniqueSubject(snapshot.data,'politie',discordId);
        return subject&&canReadPersonnelSubject(req.bpd,subject)?
          {...e,subject,discordId}:null;
      }).filter(Boolean);
      const docs=allowed.length?await db().getAll(...allowed.map(e=>
        db().collection('bpd_cases').doc(e.caseId).collection('entries').doc(e.entryId))):[];
      const nominations=docs.flatMap((d,i)=>{
        if(!d.exists||d.get('type')!=='voordracht_ereteken'||d.get('status')==='verwijderd')return [];
        const e=allowed[i];
        return [{discordId:e.discordId,entryId:e.entryId,call:e.subject.call,
          name:e.subject.name,eventDate:d.get('eventDate')||null,
          details:String(d.get('details')||'').slice(0,2000),
          status:d.get('nominationStatus')||'pending'}];
      });
      res.set('Cache-Control','private, no-store');
      return res.json({nominations,limited:notices.size===350||ids.length===90});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/award-nominations/decision',requireUser,async(req,res)=>{
    if(!mayReviewNominations(req.bpd))return res.status(403).json({error:'Geen voordrachtbevoegdheid'});
    const body=req.body||{},discordId=body.discordId,entryId=body.entryId;
    const decision=body.decision,reason=String(body.reason||'').trim();
    if(!validDiscord(discordId)||typeof entryId!=='string'||
       !/^[A-Za-z0-9]{10,40}$/.test(entryId)||
       !['approve','reject'].includes(decision)||reason.length<10||reason.length>500||
       /[<>\x00-\x1f\x7f]/.test(reason)||
       Object.keys(body).some(k=>!['discordId','entryId','decision','reason'].includes(k)))
      return res.status(400).json({error:'Ongeldige beslissing of motivering'});
    if(req.bpd.discordId===discordId)
      return res.status(403).json({error:'Je kunt niet over je eigen voordracht beslissen'});
    try{
      const snapshot=await getSnapshot();
      if(snapshot.stale)return res.status(503).json({error:'Personeelsbron niet actueel'});
      const subject=uniqueSubject(snapshot.data,'politie',discordId);
      if(!subject||!canReadPersonnelSubject(req.bpd,subject))
        return res.status(403).json({error:'Afgeschermd dossier of geen eenduidige fiche'});
      const ref=db().collection('bpd_cases').doc(caseId('politie',discordId))
        .collection('entries').doc(entryId),at=FieldValue.serverTimestamp();
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists||doc.get('type')!=='voordracht_ereteken'||doc.get('status')==='verwijderd')
          throw Object.assign(Error('Voordracht bestaat niet'),{status:404});
        if(doc.get('nominationStatus')&&doc.get('nominationStatus')!=='pending')
          throw Object.assign(Error('Voordracht is reeds beoordeeld'),{status:409});
        tx.update(ref,{nominationStatus:decision==='approve'?'approved':'rejected',
          nominationDecisionReason:reason,nominationDecidedBy:req.bpd.discordId,
          nominationDecidedAt:at});
        tx.create(ref.collection('audit').doc(),{
          action:decision==='approve'?'nomination_approved':'nomination_rejected',
          reason,actorDiscordId:req.bpd.discordId,at});
      });
      res.set('Cache-Control','private, no-store');
      return res.json({saved:true,status:decision==='approve'?'approved':'rejected',
        medalAwarded:false,message:'Voordracht beoordeeld. Een ereteken wordt afzonderlijk toegekend in Onderscheidingen.'});
    }catch(e){
      if(e?.status)return res.status(e.status).json({error:e.message});
      errorResponse(res,e);
    }
  });
  // Members can inspect ONLY their own inactivity pings. Their verified
  // portal identity is supplied by requireUser, never by a URL/body ID.
  app.get('/api/management/pings/mine',requireMemberUser,async(req,res)=>{
    const id=req.bpd?.discordId;
    if(!validDiscord(id))return res.status(403).json({error:'Geverifieerde Discord-koppeling vereist'});
    try{
      const docs=await db().collection(INACTIVITY_PING_NOTICES).doc(id)
        .collection('events').orderBy('createdAt','desc').limit(60).get();
      res.set('Cache-Control','private, no-store');
      res.json({pings:docs.docs.map(doc=>publicPingNotice(doc.id,doc.data())).filter(Boolean)});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/pings/mine/:entryId/read',requireMemberUser,async(req,res)=>{
    const id=req.bpd?.discordId,entryId=req.params.entryId;
    if(!validDiscord(id))return res.status(403).json({error:'Geverifieerde Discord-koppeling vereist'});
    if(!validPingId(entryId)||Object.keys(req.body||{}).length)
      return res.status(400).json({error:'Ongeldige pingverwijzing'});
    try{
      const ping=db().collection(INACTIVITY_PING_NOTICES).doc(id).collection('events').doc(entryId);
      const result=await db().runTransaction(async tx=>{
        const current=await tx.get(ping);
        if(!current.exists||current.get('targetDiscordId')!==id||
          current.get('type')!=='inactiviteitsping')
          return 'not_found';
        if(current.get('status')==='read')return 'already_read';
        const dept=current.get('dept'),caseKey=current.get('caseId');
        if(caseKey!==caseId(dept,id)||!['politie','brandweer','ambulance','depannage','burger'].includes(dept)||
           current.get('entryId')!==entryId)return 'invalid_reference';
        const entry=db().collection('bpd_cases').doc(caseKey).collection('entries').doc(entryId);
        const original=await tx.get(entry);
        if(!original.exists||original.get('type')!=='inactiviteitsping'||
           original.get('subjectDiscordId')!==id||original.get('dept')!==dept)
          return 'invalid_reference';
        const at=FieldValue.serverTimestamp();
        tx.update(ping,{status:'read',readAt:at});
        tx.update(entry,{pingNotificationStatus:'read',pingReadAt:at,pingReadByDiscordId:id});
        tx.create(entry.collection('audit').doc(),{
          action:'inactiviteitsping_read',subjectDiscordId:id,
          sourceNotificationId:entryId,at,source:'member_meldingen'
        });
        return 'read';
      });
      if(result==='not_found')return res.status(404).json({error:'Melding niet gevonden'});
      if(result==='invalid_reference')return res.status(409).json({error:'Dossierkoppeling vraagt controle'});
      res.set('Cache-Control','private, no-store');
      return res.json({read:true,alreadyRead:result==='already_read'});
    }catch(e){errorResponse(res,e)}
  });
  // Bewaar de oorspronkelijke observatie/sanctie. Alleen officierenkader en korpsleiding
  // mogen een individuele registratie als test markeren of de markering opheffen.
  // Elke wijziging krijgt een eigen auditdocument, nooit een automatische tekstanalyse.
  app.patch('/api/management/cases/:dept/:discordId/:entryId/test-classification',requireUser,cadre,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Dossierwijzigingen staan uit'});
    const {dept,discordId:id,entryId}=req.params;
    if(!req.bpd.dossierNativeDepartments?.includes(dept)||!canReadServiceDossier(req.bpd,dept)||!mayClassifyTest(req.bpd,dept))return res.status(403).json({error:'Alleen bevoegd officierenkader of korpsleiding mag testregistraties markeren'});
    if(!validDiscord(id)||!safeReportId(entryId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    let classification;
    try{classification=validateTestClassification(req.body)}
    catch(err){return res.status(400).json({error:err.message})}
    try{
      const snap=await getSnapshot();
      if(!uniqueSubject(snap.data,dept,id))return res.status(404).json({error:'Personeelsfiche niet eenduidig gevonden'});
      const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Eigen personeelsfiche is nog niet gekoppeld'});
      const entryRef=db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').doc(entryId);
      const auditRef=entryRef.collection('audit').doc();
      await db().runTransaction(async tx=>{
        const existing=await tx.get(entryRef);
        if(!existing.exists)throw Object.assign(new Error('Registratie niet gevonden'),{status:404});
        const old=existing.data();
        if(old.dept!==dept||old.subjectDiscordId!==id)throw Object.assign(new Error('Registratie niet gevonden'),{status:404});
        const previous=isTestRecord(old);
        if(previous===classification.testRecord)throw Object.assign(new Error('Deze testmarkering is al ingesteld'),{status:409});
        const now=FieldValue.serverTimestamp();
        tx.update(entryRef,{testRecord:classification.testRecord,testClassification:{reason:classification.reason,by:actor,at:now},modifiedAt:now});
        tx.create(auditRef,{kind:'test-classification',previous,next:classification.testRecord,reason:classification.reason,by:actor,byUid:req.bpd.uid,at:now});
      });
      res.json({saved:true,testRecord:classification.testRecord});
    }catch(err){
      if(err?.status===404||err?.status===409)return res.status(err.status).json({error:err.message});
      return errorResponse(res,err);
    }
  });
  app.get('/api/management/reports',requireUser,async(req,res)=>{
    const dept=asString(req.query.dept);
    try{
      const snapshot=await getSnapshot();
      if(snapshot.stale)return res.status(503).json({error:'Personeelsbron niet actueel'});
      if(!canReadServiceDossier(req.bpd,dept)||
        !mayReadFortnightReport(req.bpd,dept,snapshot.data))
        return res.status(403).json({error:'Alleen de aangewezen leiding van deze dienst mag de rapporten raadplegen'});
      const [snaps,removals]=await Promise.all([
        db().collection('bpd_weekreports').where('dept','==',dept).limit(200).get(),
        db().collection('bpd_weekreport_removals').where('dept','==',dept).get()
      ]);
      const hidden=new Set(removals.docs.map(d=>d.id));
      const legacy=snaps.docs.map(d=>({id:d.id,...d.data(),createdAt:toIso(d.get('createdAt'))}))
        .map(({createdByUid,createdByEmail,...safe})=>safe);
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
        year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      // Each elapsed period is listed back to the first automatic report.
      const automated=automaticFortnightReports(dept,today,52);
      const latestRestart=await db().collection('bpd_weekreport_restarts').doc(automated[0].id).get();
      if(latestRestart.exists){
        automated[0].restartedAt=toIso(latestRestart.get('restartedAt'));
        automated[0].restartRevision=latestRestart.get('revision')||1;
      }
      const available=visibleFortnightReports([...automated,...legacy],hidden,today).sort((a,b)=>
        (b.periodStart||'').localeCompare(a.periodStart||''));
      const {active,archive}=splitReportsByPeriod(available,today);
      res.json({reports:active,archivedReports:archive,
        canRemove:enabled()&&mayRemoveWeekReport(req.bpd,dept,snapshot.data),
        limited:snaps.docs.length===200,automatic:true});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/reports',requireUser,cadre,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Opslag staat uit; stel BPD_ENABLE_MANAGEMENT_WRITES=true in na controle'});
    try{
      const r=validateWeekReport(req.body);
      const snap=await getSnapshot();
      if(!req.bpd.dossierNativeDepartments?.includes(r.dept)||
        !canReadServiceDossier(req.bpd,r.dept)||
        !mayReadFortnightReport(req.bpd,r.dept,snap.data))
        return res.status(403).json({error:'Geen rapportrechten voor deze hulpdienst'});
      const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Koppel het ingelogde account eerst aan een personeelsfiche'});
      const d=db().collection('bpd_weekreports').doc();
      await d.create({...r,createdBy:actor,createdByUid:req.bpd.uid,createdAt:FieldValue.serverTimestamp()});
      res.status(201).json({saved:true,id:d.id});
    }catch(e){errorResponse(res,e)}
  });
  // A report is hidden through an immutable removal record, not deleted from
  // personnel dossiers. The marker also serves as an auditable deletion log.
  app.delete('/api/management/reports/:id',requireUser,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Rapportwijzigingen staan uit'});
    const id=asString(req.params.id),automatic=parseAutomaticReportId(id);
    if(!automatic&&!safeReportId(id))
      return res.status(400).json({error:'Ongeldige rapportverwijzing'});
    try{
      const snap=await getSnapshot();
      if(snap.stale)return res.status(503).json({error:'Personeelsbron niet actueel'});
      const legacy=automatic?null:await db().collection('bpd_weekreports').doc(id).get();
      if(!automatic&&!legacy.exists)return res.status(404).json({error:'Rapport bestaat niet'});
      const report=automatic||legacy.data();
      if(!canReadServiceDossier(req.bpd,report.dept)||
        !mayRemoveWeekReport(req.bpd,report.dept,snap.data))
        return res.status(403).json({error:'Alleen bevoegd Politie-Officierenkader, Korpsleiding of geverifieerd Technisch Beheer mag weekrapporten wissen'});
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
        year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if(isCurrentAutomaticReport(report,today))
        return res.status(409).json({error:'Het lopende automatische weekrapport kan niet gewist worden. Het wordt dagelijks uit dossiergegevens opgebouwd.'});
      const actor=reportAuditActor(req,snap.data);
      if(!actor)return res.status(403).json({error:'Eigen personeelsfiche is niet gekoppeld'});
      const marker=db().collection('bpd_weekreport_removals').doc(id);
      try{
        await marker.create({
          reportId:id,dept:report.dept,title:report.title,
          periodStart:report.periodStart,periodEnd:report.periodEnd,
          source:automatic?'automatic':report.source||'manual',
          removedAt:FieldValue.serverTimestamp(),
          removedBy:actor,removedByUid:req.bpd.uid,
          action:'report-hidden',retainsDossierEntries:true
        });
      }catch(err){
        if(err?.code===6||err?.code==='already-exists')
          return res.status(409).json({error:'Dit rapport werd reeds gewist'});
        throw err;
      }
      res.set('Cache-Control','private, no-store');
      return res.json({saved:true,id});
    }catch(e){errorResponse(res,e)}
  });
  // Only current automatic report: a reset retains all source records and audits
  // and changes only which older records appear in the current report.
  app.post('/api/management/reports/:id/restart',requireUser,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Rapportwijzigingen staan uit'});
    const id=asString(req.params.id),body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).some(k=>k!=='reason')||
       typeof body.reason!=='string'||body.reason.trim().length<10||
       body.reason.trim().length>500)
      return res.status(400).json({error:'Vul een motivering in van 10 tot 500 tekens'});
    try{
      const snap=await getSnapshot();
      if(snap.stale)return res.status(503).json({error:'Personeelsbron niet actueel'});
      const report=parseAutomaticReportId(id);
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
        year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if(!report||!isCurrentAutomaticReport(report,today))
        return res.status(409).json({error:'Alleen het lopende automatische rapport kan opnieuw gestart worden'});
      if(!canReadServiceDossier(req.bpd,report.dept)||
         !mayRemoveWeekReport(req.bpd,report.dept,snap.data))
        return res.status(403).json({error:'Alleen bevoegd Politie-Officierenkader, Korpsleiding of geverifieerd Technisch Beheer mag dit rapport herstarten'});
      const actor=reportAuditActor(req,snap.data);
      if(!actor)return res.status(403).json({error:'Eigen personeelsfiche is niet gekoppeld'});
      const ref=db().collection('bpd_weekreport_restarts').doc(id);
      const audit=ref.collection('events').doc();
      const instant=new Date(),at=Timestamp.fromDate(instant);
      let revision;
      await db().runTransaction(async tx=>{
        const current=await tx.get(ref);
        revision=(current.exists?current.get('revision')||0:0)+1;
        tx.set(ref,{reportId:id,dept:report.dept,
          periodStart:report.periodStart,periodEnd:report.periodEnd,
          restartedAt:at,revision,lastReason:body.reason.trim(),
          restartedBy:actor,restartedByUid:req.bpd.uid,
          sourceEntriesPreserved:true});
        tx.create(audit,{action:'automatic_report_restarted',reportId:id,
          dept:report.dept,reason:body.reason.trim(),revision,
          actor,actorUid:req.bpd.uid,at,sourceEntriesPreserved:true});
      });
      res.set('Cache-Control','private, no-store');
      res.json({saved:true,id,revision,restartedAt:instant.toISOString(),
        periodStart:report.periodStart,periodEnd:report.periodEnd,
        sourceEntriesPreserved:true});
    }catch(e){errorResponse(res,e)}
  });
  // Eén server-side rapportbouwer voor zowel de beveiligde JSON-weergave als DOCX-export.
  // De rechten worden voor elke aanvraag opnieuw gecontroleerd, ook voor downloaden.
  async function assembleReport(req,id){
    const automatic=parseAutomaticReportId(id);
    if(!automatic&&!safeReportId(id))return {status:400,error:'Ongeldige rapportverwijzing'};
    const doc=automatic?null:await db().collection('bpd_weekreports').doc(id).get();
    if(!automatic&&!doc.exists)return {status:404,error:'Rapport bestaat niet'};
    const report=automatic||doc.data();
    // Include departed members in the *report scope only*. Their original
    // dossier events must remain visible in the fortnight of occurrence.
    // This does NOT reactivate them in the regular personnel roster.
    const snap=await getSnapshot({includeArchived:true});
    if(snap.stale)return {status:503,error:'Personeelsbron niet actueel'};
    if(!canReadServiceDossier(req.bpd,report.dept)||
      !mayReadFortnightReport(req.bpd,report.dept,snap.data))
      return {status:403,error:'Geen toegang tot deze dienstgebonden rapportage'};
    // A removed report must not be accessible via a guessed direct URL or export.
    const removal=await db().collection('bpd_weekreport_removals').doc(id).get();
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
      year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(removal.exists&&!isCurrentAutomaticReport(report,today))
      return {status:404,error:'Dit weekrapport is uit het overzicht verwijderd'};
    const restart=automatic?await db().collection('bpd_weekreport_restarts').doc(id).get():null;
    const resetAt=restart?.exists?restart.get('restartedAt'):null;
    const allSubjects=snap.data.filter(p=>p.dept===report.dept && validDiscord(p.personId));
    const uniqueIds=[...new Set(allSubjects.map(p=>p.personId))].filter(pid=>uniqueSubject(allSubjects,report.dept,pid));
    const result=[];let truncated=false;
    for(let i=0;i<uniqueIds.length;i+=12){
      const parts=await Promise.all(uniqueIds.slice(i,i+12).map(async pid=>{
        const rows=await db().collection('bpd_cases').doc(caseId(report.dept,pid)).collection('entries')
          .where('eventDate','>=',report.periodStart).where('eventDate','<=',report.periodEnd).limit(201).get();
        return {truncated:rows.docs.length>200,docs:rows.docs.slice(0,200)
          .filter(d=>d.get('status')!=='verwijderd'&&includedAfterReportRestart(d.get('createdAt'),resetAt))
          .map(d=>({id:d.id,...noPrivate(d.data())}))};
      }));
      for(const part of parts){result.push(...part.docs);if(part.truncated)truncated=true;}
    }
    // Canonieke opleidingsresultaten horen automatisch in het dynamische
    // weekrapport van hun eigen hulpdienst; geen tweede registratie of write.
    // Oudere losse opleidingsNOTITIES blijven staan als historische entries.
    for(let i=0;i<uniqueIds.length;i+=12){
      const people=uniqueIds.slice(i,i+12);
      const part=await Promise.all(people.map(async pid=>{
        const rows=await db().collection('bpd_training').doc(caseId(report.dept,pid))
          .collection('records').where('eventDate','>=',report.periodStart)
          .where('eventDate','<=',report.periodEnd).limit(201).get();
        return {pid,rows:rows.docs};
      }));
      for(const {pid,rows} of part){
        if(rows.length>200)truncated=true;
        const person=uniqueSubject(allSubjects,report.dept,pid);
        for(const doc of rows.slice(0,200)){
          const r=doc.data();
          if(isArchivedTraining(r)||!includedAfterReportRestart(r.createdAt,resetAt))continue;
          const teacher=allSubjects.find(p=>p.personId===r.registeredByDiscordId);
          result.push({
            id:'training:'+doc.id,type:'opleiding',eventDate:r.eventDate,
            courseName:r.courseName,trainingResult:r.result,
            details:['Opleidingsresultaat: '+({geslaagd:'Geslaagd',
              niet_geslaagd:'Niet geslaagd',in_opleiding:'In opleiding',
              stage:'Stage',restricted:'RESTRICTED'}[r.result]||'Onbekend'),
              r.instructorName?'Opleider: '+String(r.instructorName).slice(0,120):'',
              r.details||''].filter(Boolean).join(' · '),
            subjectDiscordId:pid,subjectNameAtCreation:person?.name||'—',
            subjectCallAtCreation:person?.call||'—',
            registeredBy:{name:teacher?.name||'Instructeur '+(r.registeredByDiscordId||'onbekend'),
              call:teacher?.call||''},
            source:'bpd_training'
          });
        }
      }
    }
    // Professionally audited rank, callsign, name and specialization updates
    // are part of the same two-week report as dossier and course entries.
    // The date query is widened by a day on both sides to include Brussels
    // local dates around DST; each result is filtered to its local calendar day.
    const startMs=Date.parse(report.periodStart+'T00:00:00Z');
    const endMs=Date.parse(report.periodEnd+'T00:00:00Z');
    const personnelChanges=await db().collection(PERSONNEL_ACTIVITY_COLLECTION)
      .where('at','>=',Timestamp.fromMillis(startMs-86400000))
      .where('at','<=',Timestamp.fromMillis(endMs+2*86400000))
      .limit(501).get();
    if(personnelChanges.size>500)truncated=true;
    const brusselsDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
      year:'numeric',month:'2-digit',day:'2-digit'});
    const subjectIds=new Set(uniqueIds);
    const movements=new Set(['promotion','demotion','rank_changed',
      'callsign_changed','name_changed','specialization_changed','specialty_restriction_started','specialty_restriction_lifted','award_granted','award_revoked','personnel_archived','personnel_reentry_pending','personnel_restored']);
    for(const entry of personnelChanges.docs.slice(0,500)){
      const change=entry.data();
      if(change.dossierCaseLogged===true||change.dept!==report.dept||!movements.has(change.type)||
         !subjectIds.has(change.discordId)&&!['personnel_archived','personnel_reentry_pending','personnel_restored'].includes(change.type)||!change.at?.toDate?.()||
         !includedAfterReportRestart(change.at,resetAt)||
         change.rankMovement===true&&change.type==='callsign_changed')continue;
      const date=brusselsDate.format(change.at.toDate());
      if(date<report.periodStart||date>report.periodEnd)continue;
      const person=uniqueSubject(allSubjects,report.dept,change.discordId);
      if(!person&&!['personnel_archived','personnel_reentry_pending','personnel_restored'].includes(change.type))continue;
      const author=allSubjects.find(p=>p.personId===change.actorDiscordId);
      const category=change.type.startsWith('award_')?'onderscheiding':
        change.type.startsWith('specialty_restriction_')?'specialisatiebeperking':
        change.type==='specialization_changed'?'specialisatiewijziging':'personeelsbeweging';
      const description={
        promotion:'Promotie',demotion:'Degradatie',rank_changed:'Rangwissel',
        callsign_changed:'Roepnummerwijziging',name_changed:'Naamswijziging',
        specialization_changed:'Specialisatiewijziging',
        specialty_restriction_started:'Tijdelijke beperking gestart',
        specialty_restriction_lifted:'Tijdelijke beperking ingetrokken',
        award_granted:'Onderscheiding toegekend',award_revoked:'Onderscheiding ingetrokken',
        personnel_archived:'Uit dienst / archief',personnel_reentry_pending:'Herintreding in controle',personnel_restored:'Herintreding afgerond'
      }[change.type];
      const before=String(change.before||'').slice(0,120),
        after=String(change.after||'').slice(0,120),
        label=String(change.label||'').slice(0,100),
        reason=String(change.reason||'').slice(0,500);
      const details=[
        description+(label?' · '+label:'')+': '+before+' → '+after,
        change.previousCall&&change.newCall?
          'Roepnummer: '+String(change.previousCall).slice(0,24)+' → '+
            String(change.newCall).slice(0,24):'',
        reason?'Motivering: '+reason:''
      ].filter(Boolean).join(' · ');
      result.push({id:'personnel:'+entry.id,type:category,eventDate:date,
        subjectDiscordId:change.discordId,
        subjectNameAtCreation:String(change.name||person?.name||'—').slice(0,120),
        subjectCallAtCreation:String(change.call||person?.call||'—').slice(0,24),
        registeredBy:{name:author?.name||'Discord-ID '+String(change.actorDiscordId||'onbekend'),
          call:author?.call||''},
        details,source:'bpd_personnel_activity'});
    }
    // Expiry is derived on report assembly (Brussels calendar); no destructive cron writes.
    if(report.dept==='politie'){
      const [awards,uploadedCatalog]=await Promise.all([
       db().collection(PERSONNEL_DECORATIONS_COLLECTION).where('dept','==','politie').limit(501).get(),
       db().collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).limit(120).get()
      ]);
      const catalog=new Map([...CATALOG_BY_ID,...decorationCatalogExtras(uploadedCatalog.docs)]);
      if(awards.size>500)truncated=true;
      for(const doc of awards.docs.slice(0,500)){
        const pid=doc.get('discordId');
        if(!subjectIds.has(pid))continue;
        const person=uniqueSubject(allSubjects,'politie',pid);
        if(!person)continue;
        for(const award of (Array.isArray(doc.get('entries'))?doc.get('entries'):[])){
          if(!award?.endDate||!catalog.has(award.catalogId))continue;
          const date=expirationDate(award.endDate);
          if(!date||date<report.periodStart||date>report.periodEnd||date>today||
             award.revokedAt&&award.revokedAt.slice(0,10)<=award.endDate)continue;
          if(resetAt?.toMillis?.()&&Date.parse(date+'T23:59:59Z')<resetAt.toMillis())continue;
          result.push({id:'decoration-expired:'+award.id,type:'onderscheiding',eventDate:date,
            subjectDiscordId:pid,subjectNameAtCreation:person.name,
            subjectCallAtCreation:person.call,
            registeredBy:{name:'BelgiumPD · automatische geldigheidscontrole',call:''},
            details:'Tijdelijke onderscheiding verlopen: '+
              catalog.get(award.catalogId).label+' · Einddatum: '+award.endDate,
            source:'bpd_personnel_decorations'});
        }
      }
    }
    // Read-only, permission-scoped enrichment: older manual leave decisions
    // often refer to a request containing the missing reason and registrar.
    // Do not edit original events, approvals, dates or audit entries.
    const pendingLeaveIds=[...new Set(result.filter(e=>e.type==='verlof'&&
      typeof e.leaveRequestId==='string'&&
      /^[a-zA-Z0-9_-]{12,200}$/.test(e.leaveRequestId))
      .map(e=>e.leaveRequestId))];
    const leaveRequests=new Map();
    if(pendingLeaveIds.length>300){
      truncated=true;
    }else{
      try{
        for(let i=0;i<pendingLeaveIds.length;i+=25){
          const refs=pendingLeaveIds.slice(i,i+25).map(id=>
            db().collection('bpd_leave_requests').doc(id));
          const docs=await db().getAll(...refs);
          for(const doc of docs)if(doc.exists)leaveRequests.set(doc.id,doc.data());
        }
        for(let i=0;i<result.length;i++){
          const row=result[i];
          if(row.type==='verlof'&&leaveRequests.has(row.leaveRequestId))
            result[i]=projectLeaveReportEvent(row,
              leaveRequests.get(row.leaveRequestId),allSubjects);
        }
      }catch(error){
        console.warn('Weekrapport: verlofbron niet volledig beschikbaar',error?.code||'onbekend');
        truncated=true; // Never export an incomplete retrospective report.
      }
    }
    const sections=reportSections(result,report.periodStart,report.periodEnd);
    const trainingItems=sections.find(section=>section.type==='opleiding')?.entries||[];
    const completionSummary={
      passed:trainingItems.filter(item=>item.source==='bpd_training'&&
        item.trainingResult==='geslaagd').length,
      attendanceConfirmed:trainingItems.filter(item=>
        item.trainingRequestId&&item.reportCategory==='opleiding').length
    };
    const excludedTestCount=result.filter(e=>isTestRecord(e) && e.eventDate>=report.periodStart && e.eventDate<=report.periodEnd).length;
    return {report:{id:automatic?.id||doc.id,title:report.title,dept:report.dept,periodStart:report.periodStart,periodEnd:report.periodEnd,status:report.status,createdBy:report.createdBy,source:report.source||'manual',restartedAt:resetAt?toIso(resetAt):null},sections,completionSummary,
      recordCount:sections.reduce((total,section)=>total+section.entries.length,0),excludedTestCount,truncated,disclaimer:'Conceptweergave uit huidige Firestore-dossiers; als test gemarkeerde registraties en registraties van vóór een rapportherstart zijn uitgesloten. Originele dossiergegevens blijven bestaan. Dit is nog geen afgesloten of juridisch gearchiveerd rapport. Externe Word- en Google-dossiers zijn niet geïmporteerd.'};
  }
  app.get('/api/management/reports/:id',requireUser,async(req,res)=>{
    try{
      const report=await assembleReport(req,req.params.id);
      if(report.status)return res.status(report.status).json({error:report.error});
      res.set('Cache-Control','private, no-store');
      res.json(report);
    }catch(e){errorResponse(res,e)}
  });
  app.get('/api/management/reports/:id/docx',requireUser,async(req,res)=>{
    try{
      const report=await assembleReport(req,req.params.id);
      // Exports use exactly the same server-side service scope as viewing.
      // The report builder rejects cross-service and non-leadership access.
      if(report.status)return res.status(report.status).json({error:report.error});
      if(report.truncated)return res.status(409).json({error:'Rapportinhoud is onvolledig. Word-export is geblokkeerd totdat de ontbrekende registraties zijn verwerkt.'});
      const file=createWeekReportDocx(report);
      const safeName=`BelgiePD_Weekrapport_${report.report.dept}_${report.report.periodStart}_${report.report.periodEnd}.docx`;
      res.set('Cache-Control','private, no-store');
      res.set('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.set('Content-Disposition',`attachment; filename="${safeName}"`);
      res.set('X-Content-Type-Options','nosniff');
      return res.send(file);
    }catch(e){errorResponse(res,e)}
  });
}
