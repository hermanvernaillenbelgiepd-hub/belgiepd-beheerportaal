import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {canReadServiceDossier} from './service-dossier-access.js';
import {SPECIALTY_LABELS} from './normalize.js';
import {roleForDepartment} from './leave-policy.js';
import {basicObservationTargets} from './basic-observation-policy.js';
import { actorFromPersonnel, isCadre, isDiscordId, mayAmend, mayRead, maySubmit, canChooseSanction, permittedSanctionTypes, permittedDepartmentSanctions, canChooseDepartmentSanction, canRepresent, eligibleRepresentative, representativeFromPersonnel, safeSubject, validateAmend, validateEntry, SANCTION_REASONS } from './registrations.js';
const DEPTS=['politie','brandweer','ambulance','depannage'];
const trim=s=>String(s??'').trim();
const isoTimestamp=v=>v?.toDate?.().toISOString()||null;
const docId=(dept,id)=>`${dept}_${id}`;
function publicEntry(record) {
  // Firestore-waarden: Timestamp is geen JSON-tekst. De aangewezen velden expliciet teruggeven.
  const {createdAt,modifiedAt,submittedBy,...fields}=record; // uid/e-mail uitsluitend in afgeschermd Firestore-auditveld
  return {...fields,createdAt:isoTimestamp(createdAt),modifiedAt:isoTimestamp(modifiedAt)};
}
function handleError(res,err){
  if (err instanceof Error && /^(Vereist veld|Onbekend registratietype|Ongeldig|Gebruik een geldige|Selecteer minstens|Andere|Ernst|Einddatum tijdelijke beperking|Geef een reden)/.test(err.message))
    return res.status(400).json({error:err.message});
  console.error('Registratieopslag mislukt:',err?.code||err?.message||'onbekend');
  return res.status(503).json({error:'Beveiligde registratieopslag momenteel niet beschikbaar. Controleer Firestore-toegang van het serviceaccount.'});
}
export function installRegistrationRoutes(app,{requireUser,getSnapshot}){
  const db=()=>getFirestore();
  const writesEnabled=()=>process.env.BPD_ENABLE_REGISTRATIONS==='true';
  // Dossierinhoud is nooit zichtbaar via subjects: zelfs basiskader ziet alleen selectievelden.
  app.get('/api/registrations/subjects',requireUser,async(req,res)=>{
    try{
      const snap=await getSnapshot();
      const subset=snap.data.filter(p=>req.bpd.departments.includes(p.dept));
      const actor=actorFromPersonnel(req.bpd,subset);
      const representatives=(req.bpd.portalTechnicalMode===true||['middenkader','officierenkader','korpsleiding'].includes(req.bpd.role))?subset.filter(p=>eligibleRepresentative(p,p.dept) && p.personId!==actor?.discordId)
         .map(p=>({dept:p.dept,discordId:p.personId,name:p.name,call:p.call})):[];
       const sanctionDepartments=['politie','brandweer','ambulance','depannage'].filter(d=>
         (req.bpd.dossierNativeDepartments?.includes(d)||req.bpd.dossierFullDepartments?.includes(d))&&
         maySubmit(req.bpd,'sanctie',d)&&permittedDepartmentSanctions(d,roleForDepartment(req.bpd,d),10).length>0);
       const sanctionRoles=Object.fromEntries(sanctionDepartments.map(d=>[d,roleForDepartment(req.bpd,d)]));
       const sanctionOptionsByDepartment=Object.fromEntries(sanctionDepartments.map(d=>
         [d,permittedDepartmentSanctions(d,sanctionRoles[d],10)]));
       const heavySanctionDepartments=sanctionDepartments.filter(d=>sanctionRoles[d]==='korpsleiding');
       const sanctionAmendDepartments=sanctionDepartments.filter(d=>mayAmend(req.bpd,'sanctie',d) &&
         ['officierenkader','korpsleiding'].includes(sanctionRoles[d]));
       const basic=req.bpd.role==='basiskader'&&
         roleForDepartment(req.bpd,'politie')==='basiskader';
       const limited=basic?basicObservationTargets(req.bpd,snap.data):null;
       res.json({role:req.bpd.role,departments:req.bpd.departments,writesEnabled:writesEnabled(),
         fireZoneChief:req.bpd.fireZoneChief===true,portalTechnicalMode:req.bpd.portalTechnicalMode===true,
         fullDossierDepartments:req.bpd.dossierFullDepartments||[],
         sanctionDepartments,heavySanctionDepartments,sanctionAmendDepartments,sanctionRoles,sanctionOptionsByDepartment,sanctionReasons:SANCTION_REASONS,
         restrictionSpecialtiesByDepartment:Object.fromEntries(req.bpd.departments
           .filter(dept=>Array.isArray(SPECIALTY_LABELS[dept]))
           .map(dept=>[dept,SPECIALTY_LABELS[dept]])),
         observationDepartments:DEPTS.filter(d=>(req.bpd.dossierNativeDepartments?.includes(d)||req.bpd.dossierFullDepartments?.includes(d))&&maySubmit(req.bpd,'observatie',d)),actor,representatives,
         subjects:(basic?(limited?.targets||[]):subset)
           .map(p=>({dept:p.dept,discordId:p.personId,name:p.name,call:p.call}))});
    }catch(err){return handleError(res,err)}
  });
  // Registraties zijn uitsluitend zichtbaar voor kaderleden van de juiste dienst.
  app.get('/api/registrations/entries',requireUser,async(req,res)=>{
    const dept=trim(req.query.dept), id=trim(req.query.discordId);
    if(!canReadServiceDossier(req.bpd,dept))return res.status(403).json({error:'Geen dossierrechten'});
    if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const snap=await getSnapshot();
      if(!safeSubject(snap.data,dept,id))return res.status(404).json({error:'Personeelslid niet gevonden'});
      const rows=await db().collection('bpd_cases').doc(docId(dept,id)).collection('entries').orderBy('createdAt','desc').limit(100).get();
      res.json({entries:rows.docs.map(d=>({id:d.id,...publicEntry(d.data())})),limited:rows.docs.length===100});
    }catch(err){return handleError(res,err)}
  });
  // Alleen bevoegde sanctionerende kaderleden zien de gedetailleerde
  // wijzigingshistoriek. Nooit Firebase UID's, e-mail of andere auditgeheimen.
  app.get('/api/registrations/entries/:dept/:discordId/:entryId/audit',requireUser,async(req,res)=>{
    const {dept,discordId:id,entryId}=req.params;
    if(!isDiscordId(id)||!/^[a-zA-Z0-9]{12,30}$/.test(entryId))
      return res.status(400).json({error:'Ongeldige sanctieverwijzing'});
    if(!canReadServiceDossier(req.bpd,dept)||!mayAmend(req.bpd,'sanctie',dept))
      return res.status(403).json({error:'Geen toegang tot sanctie-audit'});
    try{
      const snap=await getSnapshot();
      if(!safeSubject(snap.data,dept,id))return res.status(404).json({error:'Personeelslid niet gevonden'});
      const ref=db().collection('bpd_cases').doc(docId(dept,id)).collection('entries').doc(entryId);
      const original=await ref.get();
      if(!original.exists||original.data()?.type!=='sanctie')
        return res.status(404).json({error:'Sanctie niet gevonden'});
      const old=original.data(),role=roleForDepartment(req.bpd,dept);
      if(!canChooseSanction(role,old.sanctionType,old.severity))
        return res.status(403).json({error:'Geen bevoegdheid om deze sanctiehistoriek te bekijken'});
      const rows=await ref.collection('audit').orderBy('at','desc').limit(40).get();
      return res.json({changes:rows.docs.map(d=>{
        const item=d.data(),before=item.before||{},by=item.by||{};
        return {
          at:isoTimestamp(item.at),reason:String(item.reason||'').slice(0,1000),
          actor:{name:String(by.name||'Onbekend'),call:String(by.call||'')},
          previous:{
            sanctionType:before.sanctionType||'Onbekend',
            severity:before.severity||null,status:before.status||'onbekend',
            details:String(before.details||'').slice(0,6000),
            reasons:Array.isArray(before.reasons)?before.reasons.slice(0,12):[],
            explanation:String(before.explanation||'').slice(0,2000),
            restrictedSpecialties:Array.isArray(before.restrictedSpecialties)?before.restrictedSpecialties.slice(0,12):[],
            endDate:before.endDate||null
          }
        };
      }),limited:rows.docs.length===40});
    }catch(error){return handleError(res,error)}
  });
  // Formulierindiener wordt uitsluitend afgeleid van geverifieerde Firebase-login + server-allowlist.
  app.post('/api/registrations/entries',requireUser,async(req,res)=>{
    if(!writesEnabled())return res.status(503).json({error:'Registraties staan nog uit. Stel BPD_ENABLE_REGISTRATIONS=true in na controle van Firebase-rechten.'});
    const raw=req.body;
    const dept=trim(raw?.dept), id=trim(raw?.discordId), type=trim(raw?.type);
    if(!(req.bpd.dossierNativeDepartments?.includes(dept)||req.bpd.dossierFullDepartments?.includes(dept))||!maySubmit(req.bpd,type,dept))return res.status(403).json({error:'Geen bevoegdheid om deze registratie in te dienen'});
    if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const values=validateEntry(raw);
       if(type==='sanctie' && !canChooseDepartmentSanction(
         dept,roleForDepartment(req.bpd,dept),values.sanctionType,values.severity))
         return res.status(403).json({error:values.sanctionType==='Voorstel tot degradatie'?
           'Een voorstel tot degradatie is alleen toegestaan bij ernst 9 of 10 op 10.':
           'Deze sanctiemaatregel is niet toegestaan voor jouw kaderrol. Degradatie en schorsing vereisen Officierenkader of Korpsleiding; ontslag en blacklisting uitsluitend Korpsleiding.'});
       const representedId=trim(raw?.onBehalfOfDiscordId);
       if(representedId && !canRepresent(req.bpd,type,dept)) return res.status(403).json({error:'Registratie namens een ander is alleen toegestaan voor observaties door kaderleden'});
       const onBehalfReason=representedId ? trim(raw?.onBehalfReason) : '';
       if(representedId && (onBehalfReason.length<5 || onBehalfReason.length>500))
         return res.status(400).json({error:'Geef een reden (5 tot 500 tekens) voor de registratie namens een ander'});
       const snap=await getSnapshot();
      const target=safeSubject(snap.data,dept,id);
      if(!target)return res.status(404).json({error:'Personeelslid niet gevonden of Discord ID dubbelzinnig'});
      const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Koppel je ingelogde Google-account eerst aan je eigen Discord ID in de serverconfiguratie'});
      // Ook oudere formulieren of directe API-aanroepen kunnen deze
      // beperkingen niet omzeilen: Basiskader uitsluitend naar lagere rangen.
      if(req.bpd.role==='basiskader'&&roleForDepartment(req.bpd,'politie')==='basiskader'){
        const {author,targets}=basicObservationTargets(req.bpd,snap.data);
        if(dept!=='politie'||type!=='observatie'||representedId||!author||
           !targets.some(p=>p.personId===id))
          return res.status(403).json({error:'Basiskader mag uitsluitend lagere politiegraden observeren. Sancties of registreren namens derden zijn niet toegestaan.'});
      }
      const represented=representedId?representativeFromPersonnel(snap.data,dept,representedId):null;
       if(representedId && (!represented || representedId===actor.discordId))
         return res.status(400).json({error:'Ongeldige middenkaderselectie voor registratie namens een ander'});
       const collection=db().collection('bpd_cases').doc(docId(dept,id)).collection('entries');
      const newDoc=collection.doc();
      const notice=db().collection('bpd_notices').doc(dept).collection('events').doc();
      const at=FieldValue.serverTimestamp();
      const batch=db().batch();
      batch.create(newDoc,{...values,subjectDiscordId:id,dept,subjectNameAtCreation:target.name,subjectCallAtCreation:target.call,registeredBy:represented||actor,submittedByActor:actor,onBehalfOf:represented||null,onBehalfReason,submittedBy:{uid:req.bpd.uid,email:req.bpd.email},createdAt:at,modifiedAt:null});
      // Beperkte melding zonder vertrouwelijke dossierinhoud. Wordt in dezelfde batch opgeslagen.
      batch.create(notice,{caseId:docId(dept,id),entryId:newDoc.id,type,dept,createdAt:at});
      await batch.commit();
      // Basiskader krijgt alleen bevestiging, geen record of dossierinformatie terug.
      res.status(201).json({saved:true,reference:newDoc.id});
    }catch(err){return handleError(res,err)}
  });
  // Wijziging van een sanctie vereist officierenkader/korpsleiding.
  app.patch('/api/registrations/entries/:dept/:discordId/:entryId',requireUser,async(req,res)=>{
    if(!writesEnabled())return res.status(503).json({error:'Registraties staan nog uit.'});
    const {dept,discordId:id,entryId}=req.params;
    if(!(req.bpd.dossierNativeDepartments?.includes(dept)||req.bpd.dossierFullDepartments?.includes(dept))||!canReadServiceDossier(req.bpd,dept)||!mayAmend(req.bpd,'sanctie',dept))return res.status(403).json({error:'Alleen bevoegd officierenkader en korpsleiding mogen sancties wijzigen'});
    if(!isDiscordId(id)||!/^[a-zA-Z0-9]{12,30}$/.test(entryId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    try{
      const values=validateAmend(req.body);
      const sanctionRole=roleForDepartment(req.bpd,dept);
      if(!canChooseDepartmentSanction(dept,sanctionRole,values.sanctionType,values.severity))
        return res.status(403).json({error:'Geen bevoegdheid voor deze sanctiemaatregel of ernst. Degradatie en schorsing vereisen Officierenkader; ontslag en blacklisting uitsluitend Korpsleiding.'});
      const snap=await getSnapshot();
      if(!safeSubject(snap.data,dept,id))return res.status(404).json({error:'Personeelslid niet gevonden'});
      const actor=actorFromPersonnel(req.bpd,snap.data);
      if(!actor)return res.status(403).json({error:'Koppel je ingelogde account eerst aan je eigen Discord ID'});
      const ref=db().collection('bpd_cases').doc(docId(dept,id)).collection('entries').doc(entryId);
      const audit=ref.collection('audit').doc();
      const notice=db().collection('bpd_notices').doc(dept).collection('events').doc();
      await db().runTransaction(async tx=>{
        const existing=await tx.get(ref);
        if(!existing.exists)return Object.assign(new Error('Niet gevonden'),{status:404});
        const old=existing.data();
        if(old.type!=='sanctie'||old.subjectDiscordId!==id||old.dept!==dept)throw Object.assign(new Error('Geen sanctie'),{status:404});
        // Ook de OORSPRONKELIJKE sanctie bepaalt wie ze mag wijzigen:
        // officierenkader kan nooit een degradatie/schorsing/ontslag terugdraaien.
        if(!canChooseSanction(sanctionRole,old.sanctionType,old.severity))
          throw Object.assign(new Error('Alleen Korpsleiding mag deze bestaande sanctie wijzigen'),{status:403});
        const {amendmentReason,...rest}=values;
        tx.update(ref,{...rest,modifiedAt:FieldValue.serverTimestamp(),modifiedBy:actor});
        // Oude waarden en reden bewaren in een afgeschermd log (geen harde delete).
        tx.create(audit,{before:{...old,submittedBy:old.submittedBy||null},reason:amendmentReason,by:actor,byUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
        tx.create(notice,{caseId:docId(dept,id),entryId,type:'sanctie_gewijzigd',dept,createdAt:FieldValue.serverTimestamp()});
      });
      res.json({saved:true});
    }catch(err){
      if(err?.status===404)return res.status(404).json({error:'Sanctie niet gevonden'});
      if(err?.status===403)return res.status(403).json({error:err.message});
      return handleError(res,err)
    }
  });
  app.get('/api/registrations/notifications',requireUser,async(req,res)=>{
    if(req.bpd.fireZoneChief!==true&&!isCadre(req.bpd.role)&&!req.bpd.dossierFullDepartments?.length)return res.status(403).json({error:'Geen toegang tot meldingen'});
    const dept=trim(req.query.dept);
    if(!DEPTS.includes(dept)||!canReadServiceDossier(req.bpd,dept))return res.status(403).json({error:'Geen toegang tot deze dienst'});
    try{
      const rows=await db().collection('bpd_notices').doc(dept).collection('events').orderBy('createdAt','desc').limit(40).get();
      res.json({events:rows.docs.map(d=>({id:d.id,type:d.get('type'),createdAt:isoTimestamp(d.get('createdAt')),caseId:d.get('caseId')}))});
    }catch(err){return handleError(res,err)}
  });
}
