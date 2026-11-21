import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {actorFromPersonnel} from './registrations.js';
import {INACTIVITY_PING_NOTICES} from './inactivity-ping-notifications.js';
import {uniqueStaffSubject,STAFF_DOSSIER_COLLECTION,STAFF_NOTE_TYPES}
 from './staff-dossier-policy.js';
import {canRetireDossierRecord,mayRetireCaseType,retirementReason,isRetired}
 from './dossier-retirement-policy.js';
const ID=/^\d{15,22}$/;
const ENTRY=/^[A-Za-z0-9_-]{12,120}$/;
const DEPTS=new Set(['politie','brandweer','ambulance','depannage']);
const status=(res,code,msg)=>res.status(code).json({error:msg});
export function installDossierRetirementRoutes(app,{requireUser,getSnapshot}){
 const resolve=async(req,dept,id)=>{
   if(!DEPTS.has(dept)||!ID.test(id))return {error:400,message:'Ongeldige dossierverwijzing'};
   const snapshot=await getSnapshot();
   if(snapshot.stale===true)return {error:503,message:'Personeelsbron niet actueel'};
   const subject=uniqueStaffSubject(snapshot.data,dept,id);
   if(!subject)return {error:404,message:'Personeelsfiche ontbreekt'};
   if(!canRetireDossierRecord(req.bpd,subject))
     return {error:403,message:'Alleen bevoegd Officierenkader of Korpsleiding binnen deze hulpdienst mag registraties wissen'};
   return {subject,people:snapshot.data};
 };
 app.get('/api/dossier-retirement/access',requireUser,async(req,res)=>{
   const dept=String(req.query.dept||''),id=String(req.query.discordId||'');
   try{
     const result=await resolve(req,dept,id);
     res.set('Cache-Control','private, no-store');
     if(result.error===400)return status(res,400,result.message);
     // This is only a UI capability hint; POST re-checks everything.
     return res.json({canRetire:!result.error,
       ...(result.error===503?{temporarilyUnavailable:true}:{})});
   }catch(e){
     console.error('Intrekkingsrechten:',e.code||'onbekend');
     return status(res,503,'Dossierrechten konden niet worden bevestigd');
   }
 });
 app.post('/api/dossier-retirement/:dept/:discordId/:source/:entryId',
  requireUser,async(req,res)=>{
   if(process.env.BPD_ENABLE_REGISTRATIONS!=='true')
     return status(res,503,'Dossierregistraties zijn niet ingeschakeld');
   const {dept,discordId:id,source,entryId}=req.params;
   if(!DEPTS.has(dept)||!ID.test(id)||!['cases','staff'].includes(source)||
     !ENTRY.test(entryId))return status(res,400,'Ongeldige dossierverwijzing');
   let reason;
   try{reason=retirementReason(req.body)}
   catch(e){return status(res,400,e.message)}
   try{
     const {subject,people,error,message}=await resolve(req,dept,id);
     if(error)return status(res,error,message);
     const actor=actorFromPersonnel(req.bpd,people);
     if(!actor)return status(res,403,'Je personeelsidentiteit is niet geverifieerd');
     const db=getFirestore();
     const casePath=dept+'_'+id;
     const ref=db.collection(source==='staff'?STAFF_DOSSIER_COLLECTION:'bpd_cases')
       .doc(casePath).collection('entries').doc(entryId);
     const audit=ref.collection('audit').doc();
     const reportEntry=db.collection('bpd_cases').doc(casePath)
       .collection('entries').doc();
     const notice=db.collection('bpd_notices').doc(dept).collection('events').doc();
     const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels'})
       .format(new Date());
     await db.runTransaction(async tx=>{
       const record=await tx.get(ref);
       if(!record.exists)throw Object.assign(new Error('Registratie bestaat niet'),{status:404});
       const old=record.data();
       if(source==='cases'){
         if(old.dept!==dept||old.subjectDiscordId!==id||!mayRetireCaseType(old))
           throw Object.assign(new Error('Registratie kan niet vanuit dit dossier worden gewist'),{status:403});
       }else if(!STAFF_NOTE_TYPES.includes(old.kind)){
         throw Object.assign(new Error('Onbekende basisnotitie'),{status:403});
       }
       if(isRetired(old))
         throw Object.assign(new Error('Registratie is al ingetrokken'),{status:409});
       // If a manually sent activity ping is retired, remove its live inbox
       // representation in the same transaction. Never delete the audit.
       const pingRef=source==='cases'&&old.type==='inactiviteitsping'&&
         old.pingNotificationId===entryId&&old.source!=='automatic_fivem_activity'?
         db.collection(INACTIVITY_PING_NOTICES).doc(id)
           .collection('events').doc(entryId):null;
       const pingSnapshot=pingRef?await tx.get(pingRef):null;
       if(pingSnapshot?.exists&&
         (pingSnapshot.get('type')!=='inactiviteitsping'||
          pingSnapshot.get('targetDiscordId')!==id||
          pingSnapshot.get('dept')!==dept||
          pingSnapshot.get('entryId')!==entryId))
         throw Object.assign(new Error('Gekoppelde activiteitenping moet eerst gecontroleerd worden'),{status:409});
       const kind=source==='staff'?'basisnotitie':old.type;
       const at=FieldValue.serverTimestamp();
       const change={action:'dossier_record_retired',source,kind,dept,
         subjectDiscordId:id,entryId,reason,actorUid:req.bpd.uid,
         actorDiscordId:req.bpd.discordId,actorName:actor.name,at};
       tx.update(ref,{status:'verwijderd',
         retired:{at,reason,actorDiscordId:req.bpd.discordId,actorUid:req.bpd.uid},
         ...(pingRef?{pingNotificationStatus:'verwijderd'}:{}),
         modifiedAt:at});
       if(pingSnapshot?.exists)
         tx.update(pingRef,{status:'verwijderd',
           retired:{at,reason,actorDiscordId:req.bpd.discordId}});
       tx.create(audit,change);
       // Dossieractive records disappear; the reporting event is an
       // independent immutable case entry dated the day of withdrawal.
       tx.create(reportEntry,{
         type:'activiteit',reportCategory:'activiteit',dept,
         subjectDiscordId:id,subjectNameAtCreation:subject.name,
         subjectCallAtCreation:subject.call,
         eventDate:date,registeredBy:actor,source:'dossier-retirement',
         retirementOf:{source,entryId,kind},details:
           'INTREKKING '+kind.toUpperCase()+' · registratie '+entryId+
           ' · Motivering: '+reason+' · Door '+actor.name,
         createdAt:at,modifiedAt:null
       });
       tx.create(notice,{caseId:casePath,entryId:reportEntry.id,
         type:'activiteit',action:'dossier_record_retired',
         originalEntryId:entryId,dept,createdAt:at});
     });
     return res.json({saved:true,retired:true,source,entryId,
       reportLogged:true});
   }catch(e){
     if([403,404,409].includes(e.status))return status(res,e.status,e.message);
     console.error('Dossierintrekking:',e.code||'onbekend');
     return status(res,503,'Dossierregistratie kon niet veilig worden ingetrokken');
   }
  });
}
