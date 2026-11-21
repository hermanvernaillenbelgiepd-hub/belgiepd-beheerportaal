import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {staffRoleDisplay} from './staff-role-display.js';
import {mayWriteManagement,MANAGEMENT_TYPES} from './management-utils.js';
import {actorFromPersonnel} from './registrations.js';
import {isVerifiedReportTechnicalAdmin} from './fortnight-report-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {
  STAFF_DOSSIER_COLLECTION,staffDossierEnabled,staffDossierWritesEnabled,
  staffDossierId,uniqueStaffSubject,canReadStaffDossier,canMaintainStaffDossier,
  normalizeStaffProfile,validateStaffProfile,publicStaffNote
} from './staff-dossier-policy.js';

const respond=(res,status,message)=>res.status(status).json({error:message});
const failure=(code,message)=>Object.assign(new Error(message),{httpStatus:code});
function onError(res,error){
  if(error?.httpStatus)return respond(res,error.httpStatus,error.message);
  console.error('Personeelsdossier:',error?.code||error?.message||'onbekende fout');
  return respond(res,503,'Het administratieve personeelsdossier is tijdelijk niet beschikbaar');
}
async function getSubject(req,getSnapshot){
  let key;
  try{key=staffDossierId(req.params.dept,req.params.discordId)}
  catch{throw failure(400,'Ongeldige personeelsreferentie')}
  if(!canReadStaffDossier(req.bpd,{dept:req.params.dept}))
    throw failure(403,'Geen toegang tot deze dienst');
  const snap=await getSnapshot();
  const staff=uniqueStaffSubject(snap.data,req.params.dept,req.params.discordId);
  if(!staff)throw failure(404,'Personeelsfiche ontbreekt of heeft meerdere identieke referenties');
  return {staff,key,roster:snap.data};
}
function subjectDto(staff){
  return {dept:staff.dept,discordId:staff.personId,name:staff.name,
    call:staff.call,rank:staff.rank,status:staff.status,
    rosterSeries:staff.series||null,source:staff.source||'google-sheets'};
}
export function installStaffDossierRoutes(app,{requireUser,getSnapshot}){
  app.get('/api/staff-dossiers/status',(_req,res)=>
    res.json({enabled:staffDossierEnabled(process.env),writesEnabled:staffDossierWritesEnabled(process.env)}));

  app.get('/api/staff-dossiers/:dept/:discordId',requireUser,async(req,res)=>{
    if(!staffDossierEnabled(process.env))return respond(res,503,'Administratieve personeelsdossiers zijn nog niet geactiveerd');
    try{
      const {staff,key,roster}=await getSubject(req,getSnapshot);
      const ref=getFirestore().collection(STAFF_DOSSIER_COLLECTION).doc(key);
      const [record,notes,changes,member]=await Promise.all([
        ref.get(),ref.collection('entries').orderBy('createdAt','desc').limit(60).get(),
        ref.collection('audit').orderBy('at','desc').limit(40).get(),
        getFirestore().collection('bpd_discord_auth').doc(staff.personId).get()
      ]);
      const dto=notes.docs.map(doc=>publicStaffNote(doc.data(),doc.id)).filter(Boolean);
      const managementWrites=process.env.BPD_ENABLE_REGISTRATIONS==='true'&&
        process.env.BPD_ENABLE_MANAGEMENT_WRITES==='true';
      const caseActorAvailable=Boolean(actorFromPersonnel(req.bpd,roster))||
        isVerifiedReportTechnicalAdmin(req.bpd);
      const caseTypes=managementWrites&&caseActorAvailable?
        MANAGEMENT_TYPES.filter(type=>mayWriteManagement(req.bpd,staff.dept,type)):[];
      return res.json({
        readOnly:!staffDossierWritesEnabled(process.env),
        canMaintain:staffDossierWritesEnabled(process.env)&&canMaintainStaffDossier(req.bpd,staff),
        subject:subjectDto(staff),
        discordRoles:staffRoleDisplay(member.data(),staff.dept,process.env.DISCORD_GUILD_ID),
        cadreActions:{
          // Reuse the same type policy as /api/management/overview so the
          // extra case categories survive a secondary permissions outage.
          cases:caseTypes.length>0,
          caseActorAvailable,
          caseTypes,
          manualLeave:process.env.BPD_ENABLE_LEAVE_WRITES==='true'&&
            process.env.BPD_ENABLE_PERSONNEL_MANUAL_LEAVE==='true'&&
            req.bpd.discordId!==staff.personId&&
            // The Police administrative cadre is the sole entry authority.
            // The target may belong to ANY emergency service.
            ['middenkader','officierenkader','korpsleiding'].includes(
              roleForDepartment(req.bpd,'politie'))
        },
        profile:normalizeStaffProfile(record.data()?.profile),
        revision:Number.isSafeInteger(record.get('revision'))?record.get('revision'):0,
        notes:dto,notesLimited:notes.size===60,
        profileChanges:changes.docs.map(doc=>{
          const v=doc.data();
          return {action:v.action==='profile_updated'?'profile_updated':'note_added',
            reason:typeof v.reason==='string'?v.reason.slice(0,500):'',
            recordedAt:v.at?.toDate?.()?.toISOString?.()||null,
            byDiscordId:/^\d{15,22}$/.test(v.actorDiscordId||'')?v.actorDiscordId:null};
        }),
        profileHistoryLimited:changes.size===40
      });
    }catch(e){return onError(res,e)}
  });

  app.post('/api/staff-dossiers/:dept/:discordId/profile',requireUser,async(req,res)=>{
    if(!staffDossierWritesEnabled(process.env))return respond(res,503,'Administratieve personeelswijzigingen staan uit');
    let proposal;
    try{proposal=validateStaffProfile(req.body)}
    catch(e){return respond(res,400,e.message)}
    try{
      const {staff,key}=await getSubject(req,getSnapshot);
      if(!canMaintainStaffDossier(req.bpd,staff))
        return respond(res,403,'Geen bevoegdheid om dit personeelsdossier te wijzigen');
      const ref=getFirestore().collection(STAFF_DOSSIER_COLLECTION).doc(key);
      const revision=await getFirestore().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        const current=Number.isSafeInteger(snap.get('revision'))?snap.get('revision'):0;
        if(current!==proposal.expectedRevision)
          throw failure(409,'Deze fiche werd intussen gewijzigd. Vernieuw eerst de dossiergegevens');
        const previous=normalizeStaffProfile(snap.data()?.profile);
        if(JSON.stringify(previous)===JSON.stringify(proposal.profile))
          throw failure(400,'Er zijn geen administratieve wijzigingen om te registreren');
        tx.set(ref,{dept:staff.dept,discordId:staff.personId,
          profile:proposal.profile,revision:current+1,
          updatedAt:FieldValue.serverTimestamp(),updatedByDiscordId:req.bpd.discordId||null},
          {merge:true});
        tx.create(ref.collection('audit').doc(),{
          action:'profile_updated',previous,next:proposal.profile,reason:proposal.reason,
          revision:current+1,actorUid:req.bpd.uid,
          actorDiscordId:req.bpd.discordId||null,at:FieldValue.serverTimestamp()
        });
        return current+1;
      });
      return res.json({saved:true,revision,discordRolesChanged:false,sourceSheetsChanged:false});
    }catch(e){return onError(res,e)}
  });

  // Compatibility response: the separate note-writer is retired.
  // Canonical personnel remarks live under /api/management/cases and
  // training results under /api/training; legacy staff notes remain readable.
  app.post('/api/staff-dossiers/:dept/:discordId/notes',requireUser,(_req,res)=>
    respond(res,410,'Gebruik Kaderregistraties voor notities en Opleidingen voor opleidingsresultaten'));
}
