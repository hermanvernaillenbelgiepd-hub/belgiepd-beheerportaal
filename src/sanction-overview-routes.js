import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {actorFromPersonnel} from './registrations.js';
import {isRetired} from './dossier-retirement-policy.js';
import {SANCTION_OVERVIEW_DEPARTMENTS,SANCTION_OVERVIEW_PAGE_SIZE,
  canReviewSanctions,canSeeSanctionSubject,validSanctionReference,
  validateSanctionFollowup,safeSanctionActor,sanctionOverviewItem}
  from './sanction-overview-policy.js';

// Sancties zijn vertrouwelijke personeelsregistraties. Deze module geeft
// uitsluitend geverifieerd Officierenkader/Korpsleiding toegang tot hun
// EIGEN toegelaten diensten. Notities hebben een permanente eigen historiek.
const VALID_NOTICE=/^[a-zA-Z0-9_-]{8,120}$/;
const responseError=(res,error)=>{
 if([400,403,404,409].includes(error?.status))
  return res.status(error.status).json({error:error.message});
 console.warn('Sanctieoverzicht:',error?.code||'database_fout');
 return res.status(503).json({error:'Sanctieoverzicht tijdelijk niet beschikbaar'});
};
const fail=(status,message)=>Object.assign(Error(message),{status});
const timestamp=value=>value?.toDate?.()?.toISOString?.()||null;
const caseRef=(db,dept,id)=>db.collection('bpd_cases').doc(dept+'_'+id);
const entriesRef=(db,dept,id)=>caseRef(db,dept,id).collection('entries');
const entryRef=(db,dept,id,entryId)=>entriesRef(db,dept,id).doc(entryId);
const verifiedSubject=(records,dept,id)=>{
 const matches=(records||[]).filter(p=>p.dept===dept&&p.personId===id);
 return matches.length===1?matches[0]:null;
};
const safeAuditChange=value=>{
 const before=value.before||{};
 return {
  at:timestamp(value.at),
  action:value.action==='sanction_followup_note'?'Opvolgnotitie toegevoegd':
    value.action==='sanction_edited'?'Sanctie gewijzigd':
    value.kind==='test-classification'?'Testmarkering aangepast':'Sanctie gecorrigeerd',
  actor:safeSanctionActor(value.by),
  reason:String(value.reason||'').slice(0,1000),
  previous:value.action==='sanction_followup_note'?null:{
   sanctionType:String(before.sanctionType||'').slice(0,100),
   severity:Number.isInteger(before.severity)?before.severity:null,
   status:String(before.status||'').slice(0,32),
   details:String(before.details||'').slice(0,6000)
  }
 };
};
async function access(req,getSnapshot,dept,id){
 if(!canReviewSanctions(req.bpd,dept))
  throw fail(403,'Geen sanctie-inzagerecht voor deze hulpdienst');
 const snapshot=await getSnapshot({includeArchived:true});
 if(snapshot.stale)throw fail(503,'Personeelsbron niet actueel');
 if(!id)return {snapshot};
 const subject=verifiedSubject(snapshot.data,dept,id);
 if(!subject)throw fail(404,'Personeelslid niet eenduidig gevonden');
 if(!canSeeSanctionSubject(req.bpd,subject))
  throw fail(403,'Dit personeelsdossier is beschermd');
 return {snapshot,subject};
}
export function installSanctionOverviewRoutes(app,{requireUser,getSnapshot}){
 const db=()=>getFirestore();
 const writes=()=>process.env.BPD_ENABLE_REGISTRATIONS==='true';

 app.get('/api/sanctieoverzicht/context',requireUser,(req,res)=>{
  const departments=SANCTION_OVERVIEW_DEPARTMENTS.filter(dept=>
   canReviewSanctions(req.bpd,dept));
  if(!departments.length)return res.status(403).json({error:'Alleen bevoegd Officierenkader of Korpsleiding'});
  res.set('Cache-Control','private, no-store');
  res.json({departments,writesEnabled:writes(),readOnly:!writes()});
 });

 // Pagineer over het BESTAANDE gebeurtenissenregister. Daarmee zijn ook oude
 // sancties zichtbaar, zonder een nieuwe onvolledige index te creëren of
 // een nieuwe Firestore collection-group-index in productie te vereisen.
 app.get('/api/sanctieoverzicht',requireUser,async(req,res)=>{
  const dept=String(req.query.dept||''),before=String(req.query.before||'');
  if(!canReviewSanctions(req.bpd,dept))
   return res.status(403).json({error:'Geen sanctie-inzagerecht voor deze dienst'});
  if(before&&!VALID_NOTICE.test(before))
   return res.status(400).json({error:'Ongeldige paginaverwijzing'});
  try{
   const {snapshot}=await access(req,getSnapshot,dept);
   const byId=new Map();
   for(const p of snapshot.data.filter(p=>p.dept===dept)){
    const arr=byId.get(p.personId)||[];
    arr.push(p);byId.set(p.personId,arr);
   }
   const collection=db().collection('bpd_notices').doc(dept).collection('events');
   let query=collection.orderBy('createdAt','desc').limit(SANCTION_OVERVIEW_PAGE_SIZE);
   if(before){
    const cursor=await collection.doc(before).get();
    if(!cursor.exists||!cursor.get('createdAt'))
     return res.status(400).json({error:'Deze pagina is verlopen; vernieuw het overzicht'});
    query=query.startAfter(cursor);
   }
   const events=await query.get();
   const candidates=events.docs.filter(doc=>doc.get('type')==='sanctie')
    .map(doc=>{
     const key=String(doc.get('caseId')||''),entryId=String(doc.get('entryId')||'');
     const prefix=dept+'_';
     const id=key.startsWith(prefix)?key.slice(prefix.length):'';
     const p=byId.get(id);
     return validSanctionReference(dept,id,entryId)&&p?.length===1&&
       canReadPersonnelSubject(req.bpd,p[0])?
       {person:p[0],entryId}:null;
    }).filter(Boolean);
   const rows=[];
   // Bounded reads; no direct access to another department or protected 9xx.
   for(let i=0;i<candidates.length;i+=16){
    const matches=await Promise.all(candidates.slice(i,i+16).map(async c=>{
     const doc=await entryRef(db(),dept,c.person.personId,c.entryId).get();
     const x=doc.data();
     if(!doc.exists||x?.type!=='sanctie'||x?.dept!==dept||
       x?.subjectDiscordId!==c.person.personId||isRetired(x))return null;
     return {...sanctionOverviewItem(x,c.person,c.entryId),
       registeredAt:timestamp(x.createdAt)};
    }));
    rows.push(...matches.filter(Boolean));
   }
   res.set('Cache-Control','private, no-store');
   res.json({dept,rows,scanned:events.size,
    nextCursor:events.size===SANCTION_OVERVIEW_PAGE_SIZE?
      events.docs.at(-1).id:null,
    moreAvailable:events.size===SANCTION_OVERVIEW_PAGE_SIZE});
  }catch(error){responseError(res,error)}
 });

 app.get('/api/sanctieoverzicht/:dept/:discordId/:entryId',requireUser,
 async(req,res)=>{
  const {dept,discordId,entryId}=req.params;
  if(!validSanctionReference(dept,discordId,entryId))
   return res.status(400).json({error:'Ongeldige sanctieverwijzing'});
  try{
   const {subject}=await access(req,getSnapshot,dept,discordId);
   const ref=entryRef(db(),dept,discordId,entryId);
   const [doc,notes,audit]=await Promise.all([
    ref.get(),ref.collection('followup_notes').orderBy('createdAt','desc').limit(101).get(),
    ref.collection('audit').orderBy('at','desc').limit(101).get()
   ]);
   const record=doc.data();
   if(!doc.exists||record?.type!=='sanctie'||record.dept!==dept||
       record.subjectDiscordId!==discordId||isRetired(record))
    return res.status(404).json({error:'Sanctie niet gevonden'});
   const summary=sanctionOverviewItem(record,subject,entryId);
   res.set('Cache-Control','private, no-store');
   return res.json({
    sanction:{...summary,
      details:String(record.details||'').slice(0,6000),
      explanation:String(record.explanation||'').slice(0,2000),
      otherPlayers:String(record.otherPlayers||'').slice(0,1000),
      evidenceUrl:/^https:\/\//i.test(String(record.evidenceUrl||''))?
        String(record.evidenceUrl).slice(0,800):'',
      endDate:String(record.endDate||'').slice(0,10),
      restrictedSpecialties:Array.isArray(record.restrictedSpecialties)?
        record.restrictedSpecialties.filter(x=>typeof x==='string').slice(0,40):[],
      originalRegistrant:safeSanctionActor(record.submittedByActor||record.registeredBy),
      registeredAt:timestamp(record.createdAt),
      modifiedAt:timestamp(record.modifiedAt),
      onBehalfOf:record.historicalImport===true?
        safeSanctionActor(record.onBehalfOf):null
    },
    notes:notes.docs.slice(0,100).map(n=>({
      id:n.id,text:String(n.get('text')||'').slice(0,2000),
      at:timestamp(n.get('createdAt')),actor:safeSanctionActor(n.get('by'))
    })),
    audit:audit.docs.slice(0,100).map(d=>safeAuditChange(d.data())),
    notesLimited:notes.size>100,auditLimited:audit.size>100,
    canAddNote:writes()&&req.bpd.discordId!==discordId
   });
  }catch(error){responseError(res,error)}
 });

 app.post('/api/sanctieoverzicht/:dept/:discordId/:entryId/notes',requireUser,
 async(req,res)=>{
  if(!writes())return res.status(503).json({error:'Registratieopslag momenteel uitgeschakeld'});
  const {dept,discordId,entryId}=req.params;
  if(!validSanctionReference(dept,discordId,entryId))
   return res.status(400).json({error:'Ongeldige sanctieverwijzing'});
  if(req.bpd.discordId===discordId)
   return res.status(403).json({error:'Geen eigen sanctiedossier bewerken'});
  let text;
  try{text=validateSanctionFollowup(req.body)}
  catch(error){return res.status(400).json({error:error.message})}
  try{
   const {snapshot,subject}=await access(req,getSnapshot,dept,discordId);
   let actor=actorFromPersonnel(req.bpd,snapshot.data);
   if(!actor&&req.bpd.portalTechnicalMode===true&&
     req.bpd.profileTechnicalAvailable===true&&
     req.bpd.uid==='discord:'+req.bpd.discordId)
    actor={discordId:req.bpd.discordId,name:req.bpd.name||'Technisch beheer',
     call:req.bpd.call||'',rank:'Technisch beheer',dept};
   if(!actor)throw fail(403,'Eigen kaderidentiteit kon niet worden geverifieerd');
   const who={discordId:actor.discordId,...safeSanctionActor(actor)};
   const store=db(),ref=entryRef(store,dept,discordId,entryId);
   const note=ref.collection('followup_notes').doc();
   const audit=ref.collection('audit').doc();
   const activity=entriesRef(store,dept,discordId).doc();
   const notification=store.collection('bpd_notices').doc(dept)
    .collection('events').doc();
   const at=FieldValue.serverTimestamp();
   const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   await store.runTransaction(async tx=>{
    const current=await tx.get(ref),value=current.data();
    if(!current.exists||value?.type!=='sanctie'||value.dept!==dept||
      value.subjectDiscordId!==discordId)
     throw fail(404,'Sanctie niet gevonden');
    if(isRetired(value))throw fail(409,'Gearchiveerde of verwijderde sanctie kan niet worden aangevuld');
    tx.create(note,{text,by:who,createdAt:at,relatedSanction:entryId});
    tx.create(audit,{action:'sanction_followup_note',noteId:note.id,reason:'Opvolgnotitie toegevoegd',
     by:who,byUid:req.bpd.uid,at});
    // Zelfstandige entry: zichtbaar in het dossier en dynamische weekrapport.
    // De originele sanctie en haar bestaande audit blijven ONGEWIJZIGD.
    tx.create(activity,{type:'activiteit',reportCategory:'activiteit',dept,
     subjectDiscordId:discordId,subjectNameAtCreation:subject.name,
     subjectCallAtCreation:subject.call,subjectRankAtCreation:subject.rank,
     eventDate:day,source:'sanction-followup-note',
     relatedSanction:{entryId,sanctionType:value.sanctionType||'Sanctie'},
     details:'OPVOLGNOTITIE BIJ SANCTIE · '+String(value.sanctionType||'Sanctie')+
      ' · Dossierregistratie '+entryId+' · '+text,
     registeredBy:who,createdAt:at,modifiedAt:null});
    tx.create(notification,{caseId:dept+'_'+discordId,entryId:activity.id,
     type:'sanctie_notitie',originalEntryId:entryId,dept,createdAt:at});
   });
   res.status(201).json({saved:true,noteId:note.id,
    sanctionUnchanged:true,dossierLogged:true,weekReportLogged:true});
  }catch(error){responseError(res,error)}
 });
}
