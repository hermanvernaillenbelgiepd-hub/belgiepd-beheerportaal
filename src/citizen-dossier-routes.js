import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {verifyGuildAuthorizationRoles} from './discord-guild-authorization.js';
import {loadSubjectCheckrides} from './checkride-dossier-history.js';
import {
  CITIZEN_DOSSIER_COLLECTION,validCitizenId,verifiedCitizenCouncil,
  canAccessCitizenDossier,canWriteCitizenDossier,canDeleteCitizenEntry,canManageCitizenDeletions,citizenMemberType,verifiedManualCitizenCouncil,
  citizenSubject,validateCitizenEntry,validateCitizenDeletion,observationAverage,
  citizenDossierRole,CITIZEN_DOSSIER_ROLE_LABELS,validateCitizenProfile
} from './citizen-dossier-policy.js';

const enabled=()=>process.env.BPD_ENABLE_CITIZEN_STAFF_DOSSIERS==='true';
const writable=()=>enabled()&&process.env.BPD_ENABLE_CITIZEN_STAFF_DOSSIER_WRITES==='true';
const deny=(res,status,error)=>res.status(status).json({error});
const iso=value=>{
  const date=value?.toDate?.()||value;
  return date instanceof Date&&Number.isFinite(date.valueOf())?date.toISOString():null;
};
const clean=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const validEntryId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,96}$/.test(id);
const safePerson=person=>({
  discordId:person.personId,name:clean(person.name,120),
  status:clean(person.status,50)
});
const safeEntry=doc=>{
  const e=doc.data();
  return {id:doc.id,kind:e.kind,eventDate:clean(e.eventDate,10),
    details:clean(e.details,1600),
    score:e.kind==='observatie'&&Number.isInteger(e.score)?e.score:null,
    createdAt:iso(e.createdAt),
    byDiscordId:validCitizenId(e.byDiscordId)?e.byDiscordId:null};
};
const safeDeletion=doc=>{
  const d=doc.data();
  return {id:doc.id,entryId:clean(d.entryId,96),
    kind:clean(d.originalKind,32),eventDate:clean(d.originalEventDate,10),
    reason:clean(d.reason,500),byDiscordId:validCitizenId(d.byDiscordId)?d.byDiscordId:null,
    at:iso(d.at)};
};
const safeProfileAudit=doc=>{
  const d=doc.data();
  return {id:doc.id,role:CITIZEN_DOSSIER_ROLE_LABELS[d.newRole]||'Niet geregistreerd',
    volwaardigSince:clean(d.newVolwaardigSince,10),
    reason:clean(d.reason,500),
    byDiscordId:validCitizenId(d.byDiscordId)?d.byDiscordId:null,
    at:iso(d.at)};
};
async function freshRoster(getSnapshot){
  const snap=await getSnapshot();
  if(snap?.stale||!Array.isArray(snap?.data))
    throw Object.assign(Error('De personeelsbron moet actueel zijn'),{status:503});
  return snap.data;
}
async function uniqueSubject(getSnapshot,id){
  if(!validCitizenId(id))throw Object.assign(Error('Ongeldige Discord-ID'),{status:400});
  const roster=await freshRoster(getSnapshot);
  const matching=roster.filter(p=>p?.dept==='burger'&&p.personId===id);
  if(matching.length!==1)
    throw Object.assign(Error(matching.length?'Dubbel burgerrecord, controle vereist':
      'Deze BIO/Burger staat niet in de personeelslijst'),{status:matching.length?409:404});
  return citizenSubject(roster,id);
}
function fail(res,error){
  if(error?.status)return deny(res,error.status,error.message);
  console.error('Burgerpersoneelsdossier:',error?.code||'onbekend');
  return deny(res,503,'Burgerpersoneelsdossiers tijdelijk niet beschikbaar');
}

export function installCitizenDossierRoutes(app,{requireUser,getSnapshot}){
  async function authorize(req,res,next){
    if(!enabled())return deny(res,503,'Burgerpersoneelsdossiers zijn nog niet geactiveerd');
    try{
      const actor=req.bpd;
      if(!validCitizenId(actor?.discordId)||actor.uid!=='discord:'+actor.discordId)
        return deny(res,403,'Alleen Burgerraad, Korpsleiding of technisch beheer heeft toegang');
      const member=await getFirestore().collection('bpd_discord_auth')
        .doc(actor.discordId).get();
      // Prefer an independently authenticated guild check for the current
      // logged-in Burgerraad member. Do NOT grant dossier rights from the
      // separate, presentation-only BelgiumPD user-list API.
      const live=await verifyGuildAuthorizationRoles(actor.discordId);
      // A confirmed Discord leave always invalidates both role and manual
      // recovery. Bot outage may use the same 15-minute verified snapshot.
      const fresh=live.status==='ok'?
        {guildId:process.env.DISCORD_GUILD_ID,verifiedAt:Date.now(),roleIds:live.roleIds}:
        live.status==='not_member'?null:member.data();
      const verified=Boolean(fresh&&(
        verifiedCitizenCouncil(actor,fresh,process.env.DISCORD_GUILD_ID)||
        verifiedManualCitizenCouncil(actor,fresh,process.env.DISCORD_GUILD_ID)
      ));
      if(!canAccessCitizenDossier(actor,verified))
        return deny(res,403,'Alleen Burgerraad, Korpsleiding of technisch beheer heeft toegang');
      req.citizenCouncilVerified=verified;
      return next();
    }catch(e){return fail(res,e)}
  }
  const protectedUser=[requireUser,authorize];
  const actorWrites=req=>writable()&&canAccessCitizenDossier(req.bpd,req.citizenCouncilVerified);
  const actorDeletes=req=>writable()&&canManageCitizenDeletions(req.bpd);
  app.get('/api/citizen-staff/access',...protectedUser,(req,res)=>
    res.json({canAccess:true,writesEnabled:actorWrites(req),deletesEnabled:actorDeletes(req)}));

  app.get('/api/citizen-staff/overview',...protectedUser,async(req,res)=>{
    try{
      const roster=await freshRoster(getSnapshot);
      const subjects=roster.filter(p=>p?.dept==='burger'&&validCitizenId(p.personId));
      const counts=new Map();
      for(const p of subjects)counts.set(p.personId,(counts.get(p.personId)||0)+1);
      // Duplicate Discord IDs remain unavailable until repaired.
      const eligible=subjects.filter(p=>counts.get(p.personId)===1);
      // Read only actual Burger personnel profile records. No Police/other-service
      // identity or callsign is projected into this service selection list.
      const roles=new Map(),db=getFirestore();
      for(let i=0;i<eligible.length;i+=100){
        const group=eligible.slice(i,i+100);
        const docs=await db.getAll(...group.map(p=>
          db.collection(CITIZEN_DOSSIER_COLLECTION).doc(p.personId)));
        for(const doc of docs)if(doc.exists)roles.set(doc.id,doc.data()?.roleCode);
      }
      const rows=eligible.map(p=>{
        const role=citizenDossierRole({savedRole:roles.get(p.personId),
          rosterRank:p.rank});
        return {...safePerson(p),roleCode:role,
          roleLabel:CITIZEN_DOSSIER_ROLE_LABELS[role]||'Niet geregistreerd'};
      }).sort((a,b)=>a.name.localeCompare(b.name,'nl-BE'));
      return res.json({rows,ambiguousRecords:[...counts.values()].filter(n=>n>1).length,
        writesEnabled:actorWrites(req),deletesEnabled:actorDeletes(req)});
    }catch(e){return fail(res,e)}
  });

  app.get('/api/citizen-staff/:discordId',...protectedUser,async(req,res)=>{
    try{
      const person=await uniqueSubject(getSnapshot,req.params.discordId),db=getFirestore();
      const ref=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.personId);
      const [profileSnap,entriesSnap,memberSnap,auditSnap]=await Promise.all([
        ref.get(),
        ref.collection('entries').orderBy('createdAt','desc').limit(300).get(),
        db.collection('bpd_discord_auth').doc(person.personId).get(),
        ref.collection('audit').orderBy('at','desc').limit(100).get()
      ]);
      const liveEntries=entriesSnap.docs.filter(doc=>!doc.data().deletedAt);
      const entries=liveEntries.slice(0,200).map(safeEntry);
      const saved=profileSnap.data()||{};
      // Evaluaties worden niet gekopieerd of opnieuw opgeslagen in Burger.
      // Gebruik de bestaande dienstgebonden koppelritbron, alleen na Burgerraad-autorisatie.
      const assessment=await loadSubjectCheckrides(db,'burger',person.personId)
        .catch(()=>null);
      const promoted=entries.find(e=>e.kind==='volwaardig')||null;
      const roleType=citizenMemberType(memberSnap.data(),process.env.DISCORD_GUILD_ID);
      const roleCode=citizenDossierRole({savedRole:saved.roleCode,
        verifiedRole:roleType,rosterRank:person.rank,hasPromotion:!!promoted});
      const volwaardigDate=roleCode==='burger'?
        (Object.hasOwn(saved,'volwaardigSince')?
          saved.volwaardigSince:promoted?.eventDate||null):null;
      const profileRevision=Number.isSafeInteger(saved.profileRevision)?
        saved.profileRevision:0;
      const canWrite=writable()&&canWriteCitizenDossier(req.bpd,
        req.citizenCouncilVerified,person.personId);
      return res.json({person:safePerson(person),
        roleCode,roleLabel:CITIZEN_DOSSIER_ROLE_LABELS[roleCode]||'Niet geregistreerd',
        roleType,canWrite,canEditProfile:canWrite,
        canDelete:writable()&&canDeleteCitizenEntry(req.bpd,person.personId),
        entries,deletionLog:auditSnap.docs.filter(doc=>
          doc.get('action')==='delete-citizen-entry').map(safeDeletion),
        profileHistory:auditSnap.docs.filter(doc=>
          doc.get('action')==='update-citizen-profile').map(safeProfileAudit),
        entriesLimited:entriesSnap.size===300||liveEntries.length>200,
        deletionLogLimited:auditSnap.size===100,
        observation:observationAverage(entries,{limited:entriesSnap.size===300||liveEntries.length>200}),
        profileRevision,volwaardigDate,
        // Het persoonsrapport bevat alleen dienstgebonden Burgerregistraties.
        // Centrale verlofgegevens worden hier niet meer opgehaald.
        reportAvailable:true,
        evaluations:assessment?.evaluations||[],evaluationsLimited:assessment?.limited===true,
        evaluationsUnavailable:assessment===null});
    }catch(e){return fail(res,e)}
  });

  // An auditable, role-scoped dossier-only edit; not a Discord role grant.
  app.post('/api/citizen-staff/:discordId/profile',...protectedUser,async(req,res)=>{
    if(!writable())return deny(res,503,'Burgerdossierregistraties staan uit');
    let proposal;
    try{proposal=validateCitizenProfile(req.body)}
    catch(e){return deny(res,400,e.message)}
    try{
      const person=await uniqueSubject(getSnapshot,req.params.discordId);
      if(!canWriteCitizenDossier(req.bpd,req.citizenCouncilVerified,person.personId))
        return deny(res,403,'Geen bevoegdheid om burgerpersoneelsgegevens te wijzigen');
      const db=getFirestore(),ref=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.personId);
      const audit=ref.collection('audit').doc();
      let revision;
      await db.runTransaction(async tx=>{
        const original=await tx.get(ref),before=original.data()||{};
        const previousRevision=Number.isSafeInteger(before.profileRevision)?
          before.profileRevision:0;
        if(proposal.expectedRevision!==previousRevision)
          throw Object.assign(Error('Het burgerdossier is gewijzigd. Laad opnieuw.'),{status:409});
        if(before.roleCode===proposal.role&&
          (before.volwaardigSince??null)===proposal.volwaardigSince)
          throw Object.assign(Error('Geen wijziging om op te slaan'),{status:409});
        revision=previousRevision+1;
        tx.set(ref,{discordId:person.personId,
          roleCode:proposal.role,volwaardigSince:proposal.volwaardigSince,
          profileRevision:revision,profileUpdatedBy:req.bpd.discordId,
          updatedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.create(audit,{action:'update-citizen-profile',
          previousRole:before.roleCode||null,
          previousVolwaardigSince:before.volwaardigSince??null,
          newRole:proposal.role,newVolwaardigSince:proposal.volwaardigSince,
          reason:proposal.reason,byDiscordId:req.bpd.discordId,
          at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,revision,auditId:audit.id,
        weeklyReportWritten:false,discordRolesChanged:false});
    }catch(e){return fail(res,e)}
  });

  app.post('/api/citizen-staff/:discordId/entries',...protectedUser,async(req,res)=>{
    if(!writable())return deny(res,503,'Burgerdossierregistraties staan uit');
    let proposal;
    try{proposal=validateCitizenEntry(req.body)}
    catch(e){return deny(res,400,e.message)}
    try{
      const person=await uniqueSubject(getSnapshot,req.params.discordId);
      if(!canWriteCitizenDossier(req.bpd,req.citizenCouncilVerified,person.personId))
        return deny(res,403,'Geen bevoegdheid voor deze burgerregistratie');
      const db=getFirestore();
      const parent=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.personId);
      const entry=parent.collection('entries').doc(),batch=db.batch();
      batch.set(parent,{discordId:person.personId,updatedAt:FieldValue.serverTimestamp()},
        {merge:true});
      batch.create(entry,{...proposal,byDiscordId:req.bpd.discordId,
        createdAt:FieldValue.serverTimestamp()});
      await batch.commit();
      return res.status(201).json({saved:true,id:entry.id,
        weeklyReportWritten:false});
    }catch(e){return fail(res,e)}
  });

  // No destructive Firestore delete: an approved Korpsleiding or technical
  // manager marks the registration withdrawn and creates an immutable
  // person-bound audit event with author, reason and original content.
  app.delete('/api/citizen-staff/:discordId/entries/:entryId',
    ...protectedUser,async(req,res)=>{
    if(!writable())return deny(res,503,'Burgerdossierregistraties staan uit');
    const entryId=req.params.entryId;
    if(!validEntryId(entryId))return deny(res,400,'Ongeldige registratie-ID');
    let reason;
    try{({reason}=validateCitizenDeletion(req.body))}
    catch(e){return deny(res,400,e.message)}
    try{
      const person=await uniqueSubject(getSnapshot,req.params.discordId);
      if(!canDeleteCitizenEntry(req.bpd,person.personId))
        return deny(res,403,'Alleen Korpsleiding of technisch beheer mag registraties verwijderen');
      const db=getFirestore(),parent=db.collection(CITIZEN_DOSSIER_COLLECTION)
        .doc(person.personId);
      const entryRef=parent.collection('entries').doc(entryId);
      const auditRef=parent.collection('audit').doc();
      await db.runTransaction(async tx=>{
        const existing=await tx.get(entryRef);
        if(!existing.exists)throw Object.assign(Error('Registratie niet gevonden'),{status:404});
        const original=existing.data();
        if(original.deletedAt)throw Object.assign(
          Error('Deze registratie werd reeds verwijderd'),{status:409});
        tx.update(entryRef,{deletedAt:FieldValue.serverTimestamp(),
          deletedByDiscordId:req.bpd.discordId,deleteReason:reason});
        tx.create(auditRef,{action:'delete-citizen-entry',
          entryId,originalKind:clean(original.kind,32),
          originalEventDate:clean(original.eventDate,10),
          originalDetails:clean(original.details,1600),
          originalScore:Number.isInteger(original.score)?original.score:null,
          originalByDiscordId:validCitizenId(original.byDiscordId)?
            original.byDiscordId:null,
          byDiscordId:req.bpd.discordId,reason,at:FieldValue.serverTimestamp()});
        tx.set(parent,{updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
      return res.json({deleted:true,id:entryId,auditId:auditRef.id,
        hardDeleted:false,weeklyReportWritten:false});
    }catch(e){return fail(res,e)}
  });
}
