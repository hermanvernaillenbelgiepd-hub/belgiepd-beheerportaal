import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {canReadServiceDossier} from './service-dossier-access.js';
import { actorFromPersonnel, isCadre, isDiscordId, mayAmend, mayRead, maySubmit, canChooseSanction, canRepresent, eligibleRepresentative, representativeFromPersonnel, safeSubject, validateAmend, validateEntry } from './registrations.js';
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
  if (err instanceof Error && /^(Vereist veld|Onbekend registratietype|Ongeldig|Gebruik een geldige|Selecteer minstens|Andere|Ernst|Geef een reden)/.test(err.message))
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
      const representatives=['middenkader','officierenkader','korpsleiding'].includes(req.bpd.role)?subset.filter(p=>eligibleRepresentative(p,p.dept) && p.personId!==actor?.discordId)
         .map(p=>({dept:p.dept,discordId:p.personId,name:p.name,call:p.call})):[];
       res.json({role:req.bpd.role,departments:req.bpd.departments,writesEnabled:writesEnabled(),actor,representatives,subjects:subset.map(p=>({dept:p.dept,discordId:p.personId,name:p.name,call:p.call}))});
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
      res.json({entries:rows.docs.map(d=>({id:d.id,...publicEntry(d.data())}))});
    }catch(err){return handleError(res,err)}
  });
  // Formulierindiener wordt uitsluitend afgeleid van geverifieerde Firebase-login + server-allowlist.
  app.post('/api/registrations/entries',requireUser,async(req,res)=>{
    if(!writesEnabled())return res.status(503).json({error:'Registraties staan nog uit. Stel BPD_ENABLE_REGISTRATIONS=true in na controle van Firebase-rechten.'});
    const raw=req.body;
    const dept=trim(raw?.dept), id=trim(raw?.discordId), type=trim(raw?.type);
    if(!maySubmit(req.bpd,type,dept))return res.status(403).json({error:'Geen bevoegdheid om deze registratie in te dienen'});
    if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{
      const values=validateEntry(raw);
       if(type==='sanctie' && !canChooseSanction(req.bpd.role,values.sanctionType))
         return res.status(403).json({error:'Deze sanctiemaatregel is alleen beschikbaar voor officierenkader of korpsleiding'});
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
    if(!canReadServiceDossier(req.bpd,dept)||!mayAmend(req.bpd,'sanctie',dept))return res.status(403).json({error:'Alleen bevoegd officierenkader en korpsleiding mogen sancties wijzigen'});
    if(!isDiscordId(id)||!/^[a-zA-Z0-9]{12,30}$/.test(entryId))return res.status(400).json({error:'Ongeldige dossierverwijzing'});
    try{
      const values=validateAmend(req.body);
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
        const {amendmentReason,...rest}=values;
        tx.update(ref,{...rest,modifiedAt:FieldValue.serverTimestamp(),modifiedBy:actor});
        // Oude waarden en reden bewaren in een afgeschermd log (geen harde delete).
        tx.create(audit,{before:{...old,submittedBy:old.submittedBy||null},reason:amendmentReason,by:actor,byUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
        tx.create(notice,{caseId:docId(dept,id),entryId,type:'sanctie_gewijzigd',dept,createdAt:FieldValue.serverTimestamp()});
      });
      res.json({saved:true});
    }catch(err){if(err?.status===404)return res.status(404).json({error:'Sanctie niet gevonden'});return handleError(res,err)}
  });
  app.get('/api/registrations/notifications',requireUser,async(req,res)=>{
    if(!isCadre(req.bpd.role))return res.status(403).json({error:'Geen toegang tot meldingen'});
    const dept=trim(req.query.dept);
    if(!DEPTS.includes(dept)||!canReadServiceDossier(req.bpd,dept))return res.status(403).json({error:'Geen toegang tot deze dienst'});
    try{
      const rows=await db().collection('bpd_notices').doc(dept).collection('events').orderBy('createdAt','desc').limit(40).get();
      res.json({events:rows.docs.map(d=>({id:d.id,type:d.get('type'),createdAt:isoTimestamp(d.get('createdAt')),caseId:d.get('caseId')}))});
    }catch(err){return handleError(res,err)}
  });
}
