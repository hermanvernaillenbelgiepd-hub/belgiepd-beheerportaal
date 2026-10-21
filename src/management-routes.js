import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canReadServiceDossier} from './service-dossier-access.js';
import {actorFromPersonnel} from './registrations.js';
import {createWeekReportDocx} from './report-export.js';
import {CADRE_ROLES, MANAGEMENT_TYPES, RECORD_LABELS,mayReadManagement,mayWriteManagement,uniqueSubject,validDiscord,validateManagementEntry,validateWeekReport,reportSections,safeReportId,mayClassifyTest,isTestRecord,validateTestClassification,mayExportWeekReport} from './management-utils.js';
const asString=x=>String(x??'').trim();
const toIso=t=>t?.toDate?.().toISOString()||null;
const caseId=(dept,id)=>`${dept}_${id}`;
const noPrivate=e=>{
  const {submittedBy,submittedByActor,createdAt,modifiedAt,...other}=e;
  return {...other,createdAt:toIso(createdAt),modifiedAt:toIso(modifiedAt)};
};
const errorResponse=(res,error)=>{
  if(/^(Ongeldig|Ongeldige|Omschrijving|Rapporttitel|Rapportperiode|Einddatum|Naam van|Nieuwe naam|Voorgestelde graad|Personeelsbeweging|Datum|Begindatum|Hulpdienst)/.test(error?.message||''))return res.status(400).json({error:error.message});
  console.error('Weekrapport/dossierfout:',error?.code||error?.message||'onbekend');
  return res.status(503).json({error:'Interne dossier- of weekrapportopslag tijdelijk niet beschikbaar'});
};
export function installManagementRoutes(app,{requireUser,getSnapshot}){
  const db=()=>getFirestore();
  const enabled=()=>process.env.BPD_ENABLE_REGISTRATIONS==='true' && process.env.BPD_ENABLE_MANAGEMENT_WRITES==='true';
  const cadre=(req,res,next)=>{
    if(!CADRE_ROLES.includes(req.bpd.role))return res.status(403).json({error:'Alleen middenkader en hoger hebben toegang'});
    next();
  };
  app.get('/api/management/overview',requireUser,cadre,async(req,res)=>{
    try{
      const snap=await getSnapshot();
      const subjects=snap.data.filter(p=>canReadServiceDossier(req.bpd,p.dept)&&mayReadManagement(req.bpd,p.dept)).map(p=>({dept:p.dept,discordId:p.personId,name:p.name,call:p.call,rank:p.rank}));
      const actor=actorFromPersonnel(req.bpd,snap.data);
      res.json({role:req.bpd.role,departments:req.bpd.departments.filter(d=>mayReadManagement(req.bpd,d)),writesEnabled:enabled(),canClassifyTests:req.bpd.departments.some(d=>mayClassifyTest(req.bpd,d)),canExportReports:req.bpd.departments.some(d=>mayExportWeekReport(req.bpd,d)),actor,subjects,types:MANAGEMENT_TYPES.filter(t=>mayWriteManagement(req.bpd,req.bpd.departments[0],t))});
    }catch(e){errorResponse(res,e)}
  });
  app.get('/api/management/cases',requireUser,async(req,res)=>{
    const dept=asString(req.query.dept),id=asString(req.query.discordId);
    if(!canReadServiceDossier(req.bpd,dept))return res.status(403).json({error:'Geen dossierrechten'});
    if(!validDiscord(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const snap=await getSnapshot(),subject=uniqueSubject(snap.data,dept,id);
      if(!subject)return res.status(404).json({error:'Personeelsfiche niet eenduidig gevonden'});
      const rows=await db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').orderBy('createdAt','desc').limit(150).get();
      res.json({subject:{dept,discordId:id,name:subject.name,call:subject.call},entries:rows.docs.map(d=>({id:d.id,...noPrivate(d.data())})),limited:rows.docs.length===150});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/cases',requireUser,cadre,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Opslag staat uit; stel BPD_ENABLE_MANAGEMENT_WRITES=true in na controle'});
    const dept=asString(req.body?.dept),id=asString(req.body?.discordId),type=asString(req.body?.type);
    if(!canReadServiceDossier(req.bpd,dept)||!mayWriteManagement(req.bpd,dept,type))return res.status(403).json({error:'Geen bevoegdheid om deze categorie te registreren'});
    if(!validDiscord(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const data=validateManagementEntry(req.body),snap=await getSnapshot();
      const subject=uniqueSubject(snap.data,dept,id);
      if(!subject)return res.status(404).json({error:'Personeelsfiche niet eenduidig gevonden'});
      const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Koppel je Google-account eerst aan je eigen Discord ID'});
      const newDoc=db().collection('bpd_cases').doc(caseId(dept,id)).collection('entries').doc();
      const notice=db().collection('bpd_notices').doc(dept).collection('events').doc();
      const batch=db().batch();
      batch.create(newDoc,{...data,dept,subjectDiscordId:id,subjectNameAtCreation:subject.name,subjectCallAtCreation:subject.call,registeredBy:actor,submittedBy:{uid:req.bpd.uid,email:req.bpd.email},createdAt:FieldValue.serverTimestamp(),modifiedAt:null});
      batch.create(notice,{caseId:caseId(dept,id),entryId:newDoc.id,type,dept,createdAt:FieldValue.serverTimestamp()});
      await batch.commit();
      res.status(201).json({saved:true,reference:newDoc.id});
    }catch(e){errorResponse(res,e)}
  });
  // Bewaar de oorspronkelijke observatie/sanctie. Alleen officierenkader en korpsleiding
  // mogen een individuele registratie als test markeren of de markering opheffen.
  // Elke wijziging krijgt een eigen auditdocument, nooit een automatische tekstanalyse.
  app.patch('/api/management/cases/:dept/:discordId/:entryId/test-classification',requireUser,cadre,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Dossierwijzigingen staan uit'});
    const {dept,discordId:id,entryId}=req.params;
    if(!canReadServiceDossier(req.bpd,dept)||!mayClassifyTest(req.bpd,dept))return res.status(403).json({error:'Alleen bevoegd officierenkader of korpsleiding mag testregistraties markeren'});
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
    if(!canReadServiceDossier(req.bpd,dept))return res.status(403).json({error:'Geen toegang tot deze hulpdienst'});
    try{
      const snaps=await db().collection('bpd_weekreports').where('dept','==',dept).limit(100).get();
      const reports=snaps.docs.map(d=>({id:d.id,...d.data(),createdAt:toIso(d.get('createdAt'))})).map(({createdByUid,createdByEmail,...safe})=>safe).sort((a,b)=>(b.periodStart||'').localeCompare(a.periodStart||''));
      res.json({reports,limited:snaps.docs.length===100});
    }catch(e){errorResponse(res,e)}
  });
  app.post('/api/management/reports',requireUser,cadre,async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Opslag staat uit; stel BPD_ENABLE_MANAGEMENT_WRITES=true in na controle'});
    try{
      const r=validateWeekReport(req.body);
      if(!canReadServiceDossier(req.bpd,r.dept)||!mayReadManagement(req.bpd,r.dept))return res.status(403).json({error:'Geen rechten voor deze hulpdienst'});
      const snap=await getSnapshot();const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Koppel het ingelogde account eerst aan een personeelsfiche'});
      const d=db().collection('bpd_weekreports').doc();
      await d.create({...r,createdBy:actor,createdByUid:req.bpd.uid,createdAt:FieldValue.serverTimestamp()});
      res.status(201).json({saved:true,id:d.id});
    }catch(e){errorResponse(res,e)}
  });
  // Eén server-side rapportbouwer voor zowel de beveiligde JSON-weergave als DOCX-export.
  // De rechten worden voor elke aanvraag opnieuw gecontroleerd, ook voor downloaden.
  async function assembleReport(req,id){
    if(!safeReportId(id))return {status:400,error:'Ongeldige rapportverwijzing'};
    const ref=db().collection('bpd_weekreports').doc(id),doc=await ref.get();
    if(!doc.exists)return {status:404,error:'Rapport bestaat niet'};
    const report=doc.data();
    if(!canReadServiceDossier(req.bpd,report.dept))return {status:403,error:'Geen toegang tot deze rapportage'};
    const snap=await getSnapshot();
    const allSubjects=snap.data.filter(p=>p.dept===report.dept && validDiscord(p.personId));
    const uniqueIds=[...new Set(allSubjects.map(p=>p.personId))].filter(pid=>uniqueSubject(allSubjects,report.dept,pid));
    const result=[];let truncated=false;
    for(let i=0;i<uniqueIds.length;i+=12){
      const parts=await Promise.all(uniqueIds.slice(i,i+12).map(async pid=>{
        const rows=await db().collection('bpd_cases').doc(caseId(report.dept,pid)).collection('entries')
          .where('eventDate','>=',report.periodStart).where('eventDate','<=',report.periodEnd).limit(201).get();
        return {truncated:rows.docs.length>200,docs:rows.docs.slice(0,200).map(d=>({id:d.id,...noPrivate(d.data())}))};
      }));
      for(const part of parts){result.push(...part.docs);if(part.truncated)truncated=true;}
    }
    const sections=reportSections(result,report.periodStart,report.periodEnd);
    const excludedTestCount=result.filter(e=>isTestRecord(e) && e.eventDate>=report.periodStart && e.eventDate<=report.periodEnd).length;
    return {report:{id:doc.id,title:report.title,dept:report.dept,periodStart:report.periodStart,periodEnd:report.periodEnd,status:report.status,createdBy:report.createdBy},sections,recordCount:sections.reduce((total,section)=>total+section.entries.length,0),excludedTestCount,truncated,disclaimer:'Conceptweergave uit huidige Firestore-dossiers; als test gemarkeerde registraties zijn uitgesloten. Dit is nog geen afgesloten of juridisch gearchiveerd rapport. Externe Word- en Google-dossiers zijn niet geïmporteerd.'};
  }
  app.get('/api/management/reports/:id',requireUser,async(req,res)=>{
    try{
      const report=await assembleReport(req,req.params.id);
      if(report.status)return res.status(report.status).json({error:report.error});
      res.set('Cache-Control','private, no-store');
      res.json(report);
    }catch(e){errorResponse(res,e)}
  });
  app.get('/api/management/reports/:id/docx',requireUser,cadre,async(req,res)=>{
    // Vroegtijdige serverweigering: een afgeschermde knop of rechtstreekse URL geeft middenkader geen exportrecht.
    if(!['officierenkader','korpsleiding'].includes(req.bpd.role))
      return res.status(403).json({error:'Word- en PDF-export is uitsluitend toegestaan voor officierenkader en korpsleiding'});
    try{
      const report=await assembleReport(req,req.params.id);
      if(!report.status && !mayExportWeekReport(req.bpd,report.report.dept))
        return res.status(403).json({error:'Geen exportrechten voor deze hulpdienst'});
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
