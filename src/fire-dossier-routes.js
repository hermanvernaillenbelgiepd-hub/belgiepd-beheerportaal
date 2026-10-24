import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canReadServiceDossier} from './service-dossier-access.js';
import {fireRecordVisibility,fireMayCreate,FIRE_COURSES} from './fire-dossier-policy.js';
import {validateEntry,canChooseSanction,SANCTION_REASONS} from './registrations.js';
import {validateManagementEntry} from './management-utils.js';
const ID=new RegExp('^[0-9]{15,22}$');
const code=(res,status,message)=>res.status(status).json({error:message});
const formatDate=v=>v?.toDate?.()?.toISOString?.()||null;
const clean=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const summary=v=>v&&typeof v==='object'?{
 startDate:clean(v.startDate,10),unit:clean(v.unit,80),
 functionTitle:clean(v.functionTitle,80)}:{startDate:'',unit:'',functionTitle:''};
const publicHistory=(doc)=>{
 const d=doc.data();
 return {action:clean(d.action,45),at:formatDate(d.at),
  byDiscordId:ID.test(String(d.actorDiscordId||''))?d.actorDiscordId:null,
  reason:clean(d.reason,300)};
};

const listed=(v)=>Array.isArray(v)?v:[];
const allowedTypes=['observatie','notitie','sanctie'];
function safeCase(row,id){
 const r=row.data(),v={id,type:r.type||'',details:clean(r.details,4000),
  eventDate:clean(r.eventDate,10),createdAt:formatDate(r.createdAt),
  registeredBy:clean(r.registeredBy?.name,90),
  registeredCall:clean(r.registeredBy?.call,24)};
 if(r.type==='sanctie'){
  v.sanctionType=clean(r.sanctionType,120);
  v.severity=r.severity??null;
  v.status=clean(r.status,30);
 }
 return v;
}
async function subjectFor(req,getSnapshot){
 const snap=await getSnapshot();
 if(snap.stale)return {error:503,message:'Personeelsbron niet actueel'};
 const matches=snap.data.filter(p=>p.dept==='brandweer'&&p.personId===req.params.discordId);
 if(matches.length!==1)return {error:404,message:'Geen eenduidig Brandweerpersoneelslid'};
 const person=matches[0];
 if(!canReadServiceDossier(req.bpd,'brandweer'))
  return {error:403,message:'Geen Brandweerrechten'};
 const roles=req.bpd.fireSubjectRoleSets?.get(person.personId)||null;
 const level=fireRecordVisibility(req.bpd,person,roles);
 if(level==='none')return {error:403,message:'Dit Brandweerdossier is afgeschermd'};
 return {person,roles,level,snap};
}
const publicInfo=p=>({name:p.name||'',call:p.call||'',rank:p.rank||'',
 status:p.status||'',series:p.series||'',discordId:p.personId});
export function installFireDossierRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/fire-dossiers/courses',requireUser,(_req,res)=>
   res.json({courses:FIRE_COURSES}));
 app.get('/api/fire-dossiers/:discordId',requireUser,async(req,res)=>{
   if(!ID.test(req.params.discordId))return code(res,400,'Ongeldige Discord-ID');
   try{
     const s=await subjectFor(req,getSnapshot);
     if(s.error)return code(res,s.error,s.message);
     const {person,roles,level}=s;
     const canWrite=allowedTypes.filter(type=>fireMayCreate(req.bpd,person,roles,type));
     if(level==='identity')return res.json({person:publicInfo(person),visibility:level,
       entries:[],trainings:[],canWrite,canEditSpecialties:false});
     const db=getFirestore(),casePath='brandweer_'+person.personId;
     const [caseEntries,staffDocument,staffNotes,staffHistory,leaveRows]=await Promise.all([
       db.collection('bpd_cases').doc(casePath).collection('entries')
         .orderBy('createdAt','desc').limit(120).get(),
       db.collection('bpd_staff_dossiers').doc(casePath).get(),
       db.collection('bpd_staff_dossiers').doc(casePath).collection('entries')
         .orderBy('createdAt','desc').limit(60).get(),
       db.collection('bpd_staff_dossiers').doc(casePath).collection('audit')
         .orderBy('at','desc').limit(40).get(),
       db.collection('bpd_leave_requests').where('personDiscordId','==',person.personId)
         .limit(100).get()
     ]);
     const entries=caseEntries.docs.filter(d=>allowedTypes.includes(d.get('type')))
       .map(d=>safeCase(d,d.id));
     const oldNotes=staffNotes.docs.filter(doc=>
       ['opleiding','begeleiding','evaluatie','administratief','waardering']
         .includes(doc.get('kind'))).map(doc=>({
       id:doc.id,type:clean(doc.get('kind'),30),
       title:clean(doc.get('title'),120),details:clean(doc.get('details'),1200),
       createdAt:formatDate(doc.get('createdAt'))
     }));
     const leave=leaveRows.docs.filter(doc=>
       doc.get('status')==='approved'&&
       Array.isArray(doc.get('subjectDepartments'))&&
       doc.get('subjectDepartments').includes('brandweer')).map(doc=>({
       id:doc.id,startDate:clean(doc.get('startDate'),10),
       endDate:clean(doc.get('endDate'),10),status:'approved'
     })).sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))).slice(0,25);
     const dossierHistory=staffHistory.docs.map(publicHistory);
     const profile=summary(staffDocument.get('profile'));
     let trainings=[];
     if(level==='full'||level==='leadership'){
       const rows=await db.collection('bpd_training').doc(casePath)
         .collection('records').orderBy('createdAt','desc').limit(100).get();
       trainings=rows.docs.filter(d=>d.get('status')!=='verwijderd').map(d=>({
         id:d.id,courseName:clean(d.get('courseName'),150),
         eventDate:clean(d.get('eventDate'),10),
         result:clean(d.get('result'),40)}));
     }
     return res.json({person:publicInfo(person),visibility:level,entries,trainings,
       leave,profile,olderNotes:oldNotes,dossierHistory,
       canWrite,canEditSpecialties:(req.bpd.fireZoneChief===true||
        req.bpd.portalTechnicalMode===true&&req.bpd.profileTechnicalAvailable===true)&&
       req.bpd.discordId!==person.personId,
       specialties:listed(person.specialties).map(x=>({
         label:clean(x.label,100),value:clean(x.value,40)}))});
   }catch(e){console.error('Brandweerdossier:',e.code||'onbekend');
     return code(res,503,'Brandweerdossier niet beschikbaar')}
 });
 app.post('/api/fire-dossiers/:discordId/entries',requireUser,async(req,res)=>{
   if(process.env.BPD_ENABLE_REGISTRATIONS!=='true')
     return code(res,503,'Registraties zijn nog niet geactiveerd');
   if(!ID.test(req.params.discordId))return code(res,400,'Ongeldige Discord-ID');
   const type=req.body?.type;
   if(!allowedTypes.includes(type))return code(res,400,'Ongeldig registratietype');
   try{
     const s=await subjectFor(req,getSnapshot);
     if(s.error)return code(res,s.error,s.message);
     if(!fireMayCreate(req.bpd,s.person,s.roles,type))
       return code(res,403,'Geen recht op deze registratie');
     if(req.bpd.discordId===s.person.personId)
       return code(res,403,'Een dossierregistratie over jezelf is niet toegestaan');
     const reason=String(req.body?.reason||'').trim();
     if(reason.length<15||reason.length>500)return code(res,400,'Motivering (15–500 tekens) verplicht');
     let values;
     if(type==='notitie'){
       values=validateManagementEntry({type:'notitie',eventDate:req.body.eventDate,
         details:req.body.details});
     }else{
       values=validateEntry({
         type,details:req.body.details,eventDate:req.body.eventDate,
         eventTime:req.body.eventTime||'12:00',score:req.body.score,
         severity:req.body.severity,sanctionType:req.body.sanctionType,
         reasons:[req.body.sanctionReason||'Anders'],
         reasonOther:req.body.sanctionReason==='Anders'?reason:undefined,
         restrictedSpecialties:req.body.restrictedSpecialties||[],
         endDate:req.body.endDate||'',dept:'brandweer',
         evidenceUrl:'',explanation:reason
       });
       if(type==='sanctie'){
         const allowedLevel=(req.bpd.fireZoneChief===true||
           req.bpd.portalTechnicalMode===true&&req.bpd.profileTechnicalAvailable===true)
           ?'korpsleiding':'middenkader';
         const restricted=allowedLevel==='middenkader'&&
           !['Mondelinge waarschuwing','Officiële waarschuwing','Tijdelijke beperking'].includes(values.sanctionType);
         if(restricted||!canChooseSanction(allowedLevel,values.sanctionType,values.severity))
           return code(res,403,'Deze sanctiemaatregel is niet toegestaan');
       }
     }
     const writer=s.snap.data.filter(p=>p.dept==='brandweer'&&p.personId===req.bpd.discordId);
     if(writer.length!==1)return code(res,403,'Eigen Brandweerfiche moet gekoppeld zijn');
     const db=getFirestore(),at=FieldValue.serverTimestamp();
     const collection=db.collection('bpd_cases').doc('brandweer_'+s.person.personId).collection('entries');
     const entry=collection.doc(),audit=db.collection('bpd_notices').doc('brandweer').collection('events').doc();
     const actor={discordId:req.bpd.discordId,name:writer[0].name,call:writer[0].call,
       rank:writer[0].rank,dept:'brandweer'};
     const batch=db.batch();
     batch.create(entry,{...values,dept:'brandweer',
       subjectDiscordId:s.person.personId,subjectNameAtCreation:s.person.name,
       subjectCallAtCreation:s.person.call,registeredBy:actor,
       submittedByActor:actor,submittedBy:{uid:req.bpd.uid},
       reason,createdAt:at,modifiedAt:null,visibility:'brandweer_leiding'});
     batch.create(audit,{caseId:'brandweer_'+s.person.personId,entryId:entry.id,
       type,dept:'brandweer',createdAt:at});
     await batch.commit();
     return res.status(201).json({saved:true,reference:entry.id});
   }catch(e){
     if(e.message&&/^(Ongeldig|Ongeldige|Vereist|Selecteer|Geef|Ernst|Einddatum)/.test(e.message))
       return code(res,400,e.message);
     console.error('Brandweerregistratie:',e.code||'onbekend');
     return code(res,503,'Registratie niet beschikbaar');
   }
 });
}
