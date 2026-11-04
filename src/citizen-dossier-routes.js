import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getBelgiumPdDisplayRoles} from './bpd-discord-users-display.js';
import {isVerifiedCitizenCouncil,verifiedCitizenStage,validateCitizenEntry,
 validateCitizenLeave,CITIZEN_DOSSIER_COLLECTION,citizenReport} from './citizen-dossier-policy.js';

const ID=/^\d{15,22}$/;
const err=(res,status,message)=>res.status(status).json({error:message});
const iso=value=>value?.toDate?.()?.toISOString?.()||null;
const short=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const enabled=()=>process.env.BPD_ENABLE_CITIZEN_DOSSIERS==='true';
function fail(res,error){
 if(Number.isInteger(error?.httpStatus))return err(res,error.httpStatus,error.message);
 console.error('Burgerdossier:',typeof error?.code==='string'?error.code.slice(0,55):'databasefout');
 return err(res,503,'Burgerdossiers tijdelijk niet beschikbaar');
}
function problem(status,message){return Object.assign(new Error(message),{httpStatus:status});}
async function councilOnly(req,res,next){
 if(!enabled())return err(res,503,'Burgerdossiers zijn nog niet geactiveerd');
 const token=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
 if(!token)return err(res,401,'Meld aan met je Burgerraad Discord-account');
 try{
  if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  const decoded=await getAuth().verifyIdToken(token);
  const id=String(decoded?.uid||'').startsWith('discord:')?decoded.uid.slice(8):'';
  if(!ID.test(id))return err(res,403,'Alleen geverifieerde Burgerraad via Discord');
  const member=(await getFirestore().collection('bpd_discord_auth').doc(id).get()).data();
  if(!isVerifiedCitizenCouncil(decoded,member,process.env.DISCORD_GUILD_ID,id))
    return err(res,403,'Alleen Burgerraad heeft toegang. Vernieuw indien nodig je Discord-verificatie.');
  req.citizenCouncil={id,uid:decoded.uid,
    name:short(member.username,80)||'Burgerraad'};
  next();
 }catch(e){return fail(res,e)}
}
async function citizenSubjects(getSnapshot){
 const snapshot=await getSnapshot();
 if(snapshot.stale)throw problem(503,'Personeelsbron is niet actueel');
 const people=Array.isArray(snapshot.data)?snapshot.data:[];
 const known=new Map();
 // Prefer the service's OWN identity; never copy qualifications across services.
 for(const person of [...people].sort((a,b)=>(a.dept==='burger'?-1:1)-(b.dept==='burger'?-1:1))){
  if(ID.test(String(person.personId||''))&&
     typeof person.name==='string'&&person.name.trim()&&!known.has(person.personId))
   known.set(person.personId,person);
 }
 const upstream=await getBelgiumPdDisplayRoles(),db=getFirestore();
 const roles=['1492485336197234728','1309532438019706966','1398985105254650007'];
 const possible=upstream.status==='ok'?
   [...upstream.entries].filter(([,ids])=>Array.isArray(ids)&&ids.some(role=>roles.includes(role))).map(([id])=>id):
   null;
 // OAuth-only fallback is restricted to exact matching role IDs. Never infer
 // citizenship from a name, a Police role or an old spreadsheet stage.
 const oauthQuery=possible?null:await db.collection('bpd_discord_auth')
   .where('roleIds','array-contains-any',roles).limit(501).get();
 if(oauthQuery?.size===501)throw problem(503,'Te veel Burgerleden voor een volledige verificatie');
 const ids=[...new Set(possible||oauthQuery.docs.map(d=>d.id))].filter(id=>ID.test(id));
 if(ids.length>1000)throw problem(503,'Te veel Burgerleden voor een veilige dossierlijst');
 const oauth=new Map((oauthQuery?.docs||[]).map(d=>[d.id,d.data()]));
 // The live Discord API carries role IDs but no trusted employee name.
 // Read validated OAuth usernames only where no mapped roster name exists.
 const needed=possible?ids.filter(id=>!known.has(id)):ids.filter(id=>!oauth.has(id));
 for(let i=0;i<needed.length;i+=50){
  const part=needed.slice(i,i+50);
  const found=await db.getAll(...part.map(id=>db.collection('bpd_discord_auth').doc(id)));
  for(const doc of found)if(doc.exists)oauth.set(doc.id,doc.data());
 }
 const rows=ids.map(id=>{
  const stage=verifiedCitizenStage(id,upstream,oauth.get(id),process.env.DISCORD_GUILD_ID);
  if(!stage)return null;
  const source=known.get(id),name=short(source?.name,100)||
    short(oauth.get(id)?.username,100)||'Discord-ID '+id;
  return {discordId:id,name,stage,call:source?.dept==='burger'?
    short(source.call,24):'—',status:source?.dept==='burger'?
    short(source.status,40):'',source:source?.dept==='burger'?'burgerpersoneelslijst':
    source?'gekoppelde identiteit':'discord'};
 }).filter(Boolean);
 rows.sort((a,b)=>({Burgerraad:0,Burger:1,BIO:2}[a.stage]??3)-
    ({Burgerraad:0,Burger:1,BIO:2}[b.stage]??3)||
    a.name.localeCompare(b.name,'nl'));
 return rows;
}
function publicEntry(doc){
 const data=doc.data(),type=data.type;
 if(!['notitie','observatie','sanctie','volwaardig'].includes(type))return null;
 return {id:doc.id,type,title:short(data.title,120),
  details:short(data.details,2000),eventDate:short(data.eventDate,10),
  sanctionType:type==='sanctie'?short(data.sanctionType,20):null,
  score:type==='observatie'&&Number.isInteger(data.score)?data.score:null,
  registeredBy:short(data.registeredBy?.name,80),
  registeredByDiscordId:short(data.registeredBy?.discordId,22),
  createdAt:iso(data.createdAt)};
}
function publicLeave(doc){
 const d=doc.data();
 return {id:doc.id,startDate:short(d.startDate,10),endDate:short(d.endDate,10),
  days:Number.isSafeInteger(d.days)?d.days:null,
  status:['approved','pending','withdrawn','rejected'].includes(d.status)?d.status:'unknown',
  source:d.citizenManaged===true?'burgerraad':'centraal',
  submittedAt:iso(d.createdAt)};
}
async function subject(req,getSnapshot){
 const id=req.params.discordId;
 if(!ID.test(id))throw problem(400,'Ongeldige Discord-ID');
 const people=await citizenSubjects(getSnapshot);
 const person=people.find(row=>row.discordId===id);
 if(!person)throw problem(404,'Geen actueel BIO-, Burger- of Burgerraadlid met deze Discord-ID');
 return person;
}
async function dossierData(person){
 const db=getFirestore(),ref=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.discordId);
 const [entries,leaves]=await Promise.all([
  ref.collection('entries').orderBy('createdAt','desc').limit(200).get(),
  db.collection('bpd_leave_requests').where('personDiscordId','==',person.discordId).limit(150).get()
 ]);
 if(entries.size===200||leaves.size===150)
  throw problem(503,'Te veel dossierregels voor een volledig persoonsrapport');
 const notes=entries.docs.map(publicEntry).filter(Boolean);
 const leave=leaves.docs.map(publicLeave).sort((a,b)=>b.startDate.localeCompare(a.startDate));
 return {person,entries:notes,leave,report:citizenReport(notes,leave),
   noWeekReports:true,personReportOnly:true};
}
export function installCitizenDossierRoutes(app,{getSnapshot}){
 app.get('/api/citizen-dossiers/status',(_req,res)=>res.json({enabled:enabled()}));
 app.get('/api/citizen-dossiers/access',councilOnly,(_req,res)=>{
  res.set('Cache-Control','no-store');res.json({canOpen:true,role:'Burgerraad'});
 });
 app.get('/api/citizen-dossiers/overview',councilOnly,async(req,res)=>{
  try{
   const people=await citizenSubjects(getSnapshot);
   res.set('Cache-Control','no-store');res.json({people,access:'Burgerraad',noWeekReports:true});
  }catch(e){fail(res,e)}
 });
 app.get('/api/citizen-dossiers/:discordId',councilOnly,async(req,res)=>{
  try{
   const person=await subject(req,getSnapshot);
   res.set('Cache-Control','no-store');res.json(await dossierData(person));
  }catch(e){fail(res,e)}
 });
 app.post('/api/citizen-dossiers/:discordId/entries',councilOnly,async(req,res)=>{
  try{
   const person=await subject(req,getSnapshot);
   if(person.discordId===req.citizenCouncil.id)
    throw problem(403,'Je kunt je eigen dossier niet invullen');
   const record=validateCitizenEntry(req.body,person.stage);
   const db=getFirestore(),ref=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.discordId);
   const entryRef=ref.collection('entries').doc(),auditRef=ref.collection('audit').doc();
   const author={discordId:req.citizenCouncil.id,name:req.citizenCouncil.name};
   const batch=db.batch();
   batch.create(entryRef,{...record,registeredBy:author,
    subjectDiscordId:person.discordId,createdAt:FieldValue.serverTimestamp()});
   batch.create(auditRef,{action:record.type,entryId:entryRef.id,
    actorDiscordId:author.discordId,at:FieldValue.serverTimestamp()});
   await batch.commit();
   return res.status(201).json({saved:true,id:entryRef.id});
  }catch(e){fail(res,e)}
 });
 app.post('/api/citizen-dossiers/:discordId/leave',councilOnly,async(req,res)=>{
  try{
   const person=await subject(req,getSnapshot);
   if(person.discordId===req.citizenCouncil.id)
    throw problem(403,'Je kunt je eigen verlof niet goedkeuren');
   const data=validateCitizenLeave(req.body);
   const db=getFirestore(),ref=db.collection('bpd_leave_requests')
     .doc('burger_'+person.discordId+'_'+data.startDate+'_'+data.endDate);
   const dossier=db.collection(CITIZEN_DOSSIER_COLLECTION).doc(person.discordId);
   const event=dossier.collection('audit').doc(),caseRef=dossier.collection('entries').doc();
   const author={discordId:req.citizenCouncil.id,name:req.citizenCouncil.name};
   await db.runTransaction(async tx=>{
    const [current,existing]=await Promise.all([
      tx.get(ref),tx.get(db.collection('bpd_leave_requests')
        .where('personDiscordId','==',person.discordId).limit(150))
    ]);
    if(current.exists)throw problem(409,'Deze verlofperiode bestaat al');
    if(existing.size===150)throw problem(503,'Verlofgeschiedenis vereist controle');
    if(existing.docs.some(doc=>{
     const d=doc.data();
     return d.status==='approved'&&d.startDate<=data.endDate&&d.endDate>=data.startDate;
    }))throw problem(409,'Overlappend goedgekeurd verlof bestaat al');
    tx.create(ref,{...data,personDiscordId:person.discordId,
      subjectName:person.name,subjectCall:person.call,subjectDepartments:['burger'],
      citizenManaged:true,manual:true,status:'approved',
      decidedByUid:req.citizenCouncil.uid,decidedByDiscordId:author.discordId,
      submittedByUid:req.citizenCouncil.uid,submittedByDiscordId:author.discordId,
      createdAt:FieldValue.serverTimestamp(),decidedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp()});
    tx.create(ref.collection('audit').doc(),{action:'manual_approved',from:null,to:'approved',
      actorDiscordId:author.discordId,actorUid:req.citizenCouncil.uid,
      at:FieldValue.serverTimestamp()});
    tx.create(caseRef,{type:'verlof',eventDate:data.startDate,
      startDate:data.startDate,endDate:data.endDate,
      title:'Verlof goedgekeurd',details:data.startDate+' t/m '+data.endDate,
      leaveRequestId:ref.id,registeredBy:author,
      subjectDiscordId:person.discordId,createdAt:FieldValue.serverTimestamp()});
    tx.create(event,{action:'verlof',entryId:caseRef.id,
      actorDiscordId:author.discordId,at:FieldValue.serverTimestamp()});
   });
   return res.status(201).json({saved:true,requestId:ref.id,noWeekReport:true});
  }catch(e){fail(res,e)}
 });
}
