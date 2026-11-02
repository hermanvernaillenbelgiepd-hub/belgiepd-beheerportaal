import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {validPersonnelKey,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {extraSpecialtyLabels} from './roster-column-config.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {specialtyReadEnabled,specialtyWritesEnabled} from './specialization-policy.js';
import {SPECIALTY_RESTRICTION_COLLECTION,canRestrictSpecialty,
 safeRestrictionEntry,restrictionStatus,restrictionToday,validateRestrictionAction
} from './specialty-restriction-policy.js';

const fail=(status,msg)=>Object.assign(new Error(msg),{status});
function handle(res,error){
 if(error.status)return res.status(error.status).json({error:error.message});
 console.error('Tijdelijke specialisatiebeperkingen:',error.code||'storage_error');
 return res.status(503).json({error:'Beperkingen tijdelijk niet beschikbaar'});
}
export function installSpecialtyRestrictionRoutes(app,{requireUser,getSnapshot}){
 async function subject(req){
  const {dept,discordId}=req.params;
  if(!validPersonnelKey(dept,discordId))throw fail(400,'Ongeldige personeelsreferentie');
  if(!canReadServiceDossier(req.bpd,dept))throw fail(403,'Geen dienstinzage');
  const roster=await getSnapshot();
  const matched=roster.data.filter(p=>p.dept===dept&&p.personId===discordId);
  if(matched.length!==1)throw fail(404,'Geen eenduidige personeelsfiche');
  if(!canReadPersonnelSubject(req.bpd,matched[0]))
   throw fail(403,'Geen inzage in deze afgeschermde personeelsfiche');
  return matched[0];
 }
 app.get('/api/personnel/:dept/:discordId/specialty-restrictions',requireUser,async(req,res)=>{
  if(!specialtyReadEnabled(process.env))
   return res.status(503).json({error:'Specialisaties zijn uitgeschakeld'});
  try{
   const staff=await subject(req);
   const ref=getFirestore().collection(SPECIALTY_RESTRICTION_COLLECTION)
     .doc(staff.dept+'_'+staff.personId);
   const [snap,audit]=await Promise.all([ref.get(),
     ref.collection('audit').orderBy('at','desc').limit(40).get()]);
   const today=restrictionToday(),stored=snap.get('restrictions')||{};
   const entries=Object.entries(stored).map(([id,row])=>safeRestrictionEntry(row,id,today))
    .filter(Boolean).sort((a,b)=>a.label.localeCompare(b.label,'nl'));
   res.set('Cache-Control','private, no-store');
   return res.json({entries,revision:Number.isSafeInteger(snap.get('revision'))?
     snap.get('revision'):0,
    canRestrict:specialtyWritesEnabled(process.env)&&canRestrictSpecialty(req.bpd,staff),
    history:audit.docs.map(doc=>{
     const a=doc.data();
     return {label:String(a.label||'').slice(0,90),
      action:a.action==='lift'?'lift':'restrict',
      reason:String(a.reason||'').slice(0,500),
      by:/^\d{15,22}$/.test(a.actorDiscordId||'')?a.actorDiscordId:null,
      at:a.at?.toDate?.()?.toISOString?.()||null};
    })});
  }catch(e){return handle(res,e)}
 });
 app.post('/api/personnel/:dept/:discordId/specialty-restrictions',requireUser,async(req,res)=>{
  if(!specialtyWritesEnabled(process.env))
   return res.status(503).json({error:'Wijzigen van specialisaties staat uit'});
  try{
   const staff=await subject(req);
   if(!canRestrictSpecialty(req.bpd,staff))
    throw fail(403,'Geen bevoegdheid om tijdelijke beperkingen te registreren');
   const extra=await extraSpecialtyLabels(staff.dept);
   let proposal;
   try{proposal=validateRestrictionAction(req.body,staff.dept,extra)}
   catch(e){throw fail(400,e.message)}
   const db=getFirestore(),ref=db.collection(SPECIALTY_RESTRICTION_COLLECTION)
    .doc(staff.dept+'_'+staff.personId);
   const revision=await db.runTransaction(async tx=>{
    const old=await tx.get(ref),data=old.data()||{};
    const previousRevision=Number.isSafeInteger(data.revision)?data.revision:0;
    if(previousRevision!==proposal.expectedRevision)
     throw fail(409,'De beperkingen zijn intussen aangepast. Vernieuw de fiche.');
    const entries={...(data.restrictions||{})},today=restrictionToday();
    const currentId=Object.keys(entries).find(id=>
     entries[id]?.label===proposal.label&&
     ['actief','gepland'].includes(restrictionStatus(entries[id],today)));
    if(proposal.action==='restrict'&&currentId)
     throw fail(409,'Voor deze specialisatie bestaat al een lopende of geplande beperking');
    if(proposal.action==='lift'&&!currentId)
     throw fail(409,'Geen lopende beperking om in te trekken');
    const id=proposal.action==='restrict'?ref.collection('audit').doc().id:currentId;
    if(proposal.action==='restrict'){
     entries[id]={label:proposal.label,startDate:proposal.startDate,
      endDate:proposal.endDate,reason:proposal.reason,status:'active',
      changedBy:req.bpd.discordId||'',changedAt:FieldValue.serverTimestamp()};
    }else{
     entries[id]={...entries[id],status:'lifted',closedBy:req.bpd.discordId||'',
      closedAt:FieldValue.serverTimestamp()};
    }
    tx.set(ref,{dept:staff.dept,discordId:staff.personId,revision:previousRevision+1,
      restrictions:entries,updatedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()},
      {merge:true});
    tx.create(ref.collection('audit').doc(),{
      action:proposal.action,restrictionId:id,label:proposal.label,
      startDate:entries[id].startDate,endDate:entries[id].endDate,
      previous:currentId?'active':'none',
      next:proposal.action==='restrict'?'active':'lifted',
      reason:proposal.reason,actorUid:req.bpd.uid,
      actorDiscordId:req.bpd.discordId||null,at:FieldValue.serverTimestamp()
    });
    tx.create(db.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
      type:proposal.action==='restrict'?'specialty_restriction_started':'specialty_restriction_lifted',
      dept:staff.dept,discordId:staff.personId,
      name:String(staff.name||'Personeelslid').slice(0,120),
      label:proposal.label,
      before:proposal.action==='restrict'?'Geen beperking':'Beperking actief',
      after:proposal.action==='restrict'?'Beperkt t.e.m. '+proposal.endDate:'Beperking ingetrokken',
      reason:proposal.reason,actorDiscordId:req.bpd.discordId||null,
      at:FieldValue.serverTimestamp()
    });
    return previousRevision+1;
   });
   return res.json({saved:true,revision,discordRolesChanged:false,
    qualificationChanged:false});
  }catch(e){return handle(res,e)}
 });
}
