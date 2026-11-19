import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {TRAINING_REQUEST_COURSE_CATALOG} from '../public/training-course-catalog.js';
import {PATHWAY_COLLECTION,keyName} from './training-pathway-policy.js';
import {
 PLANNING_TRACKS,PLANNING_ASSIGNMENTS,PLANNING_CONFIG,PLANNING_STATUSES,
 planningTrack,planningManager,planningConfigurator,planningOwnMembership,
 eligiblePlanningMembers,planningAudienceMatch,planningCourseAllowed,
 validatePlanningAudience,validatePlanningAssignment,planningAssignmentKey
} from './training-planning-policy.js';

const deny=(status,message)=>Object.assign(Error(message),{status});
const error=(res,e)=>{
 if(e?.status)return res.status(e.status).json({error:e.message});
 console.warn('Opleidingsplanning:',e?.code||e?.message||'storage_error');
 return res.status(503).json({error:'Opleidingsplanning tijdelijk niet beschikbaar'});
};
const db=()=>getFirestore();
const plans=()=>db().collection(PLANNING_ASSIGNMENTS);
const configs=()=>db().collection(PLANNING_CONFIG);
const hash=v=>createHash('sha256').update(v).digest('hex');
const did=req=>req.bpd?.discordId;
const author=req=>({discordId:did(req),role:req.bpd?.role||''});
const bodyObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
const dateName=s=>typeof s==='string'?s.trim().slice(0,120):'';
const ownConfig=v=>({
 extraCourses:Array.isArray(v?.extraCourses)?v.extraCourses.filter(x=>typeof x==='string').slice(0,40):[],
 audiences:Array.isArray(v?.audiences)?v.audiences.filter(x=>x&&typeof x==='object').slice(0,25):[]
});
const builtins=()=>[
 {id:'alle',kind:'alle',value:'',label:'Alle personeelsleden (handmatig aanvinken)'},
 {id:'kandidaten',kind:'kandidaten',value:'',label:'Nieuwe kandidaten zonder specialisatie'}
];
const safeConfig=conf=>({extraCourses:conf.extraCourses,
 audiences:[...builtins(),...conf.audiences]});
async function verifiedRoles(req){
 const id=did(req);
 if(!/^\d{15,22}$/.test(String(id||'')))return [];
 const snap=await db().collection('bpd_discord_auth').doc(id).get();
 const d=snap.data()||{},now=Date.now();
 if(!snap.exists||d.guildId!==process.env.DISCORD_GUILD_ID||
    !Number.isSafeInteger(d.verifiedAt)||d.verifiedAt>now||
    now-d.verifiedAt>24*60*60*1000||!Array.isArray(d.roleIds))return [];
 return d.roleIds;
}
async function scoped(req,getSnapshot){
 const data=await getSnapshot();
 if(data.stale||!Array.isArray(data.data))throw deny(503,'Personeelsbron is niet actueel');
 const roles=await verifiedRoles(req);
 const roster=data.data;
 const tracks=PLANNING_TRACKS.filter(t=>
   planningOwnMembership(req.bpd,roster,t.department)&&
   planningManager(req.bpd,t,roles));
 return {tracks,roster,roles};
}
function allowedTrack(scopedData,id){
 const track=scopedData.tracks.find(t=>t.id===id);
 if(!track)throw deny(403,'Geen bevoegdheid voor deze opleidingsspecialisatie');
 return track;
}
async function configFor(track){
 const d=await configs().doc(track.id).get();
 return ownConfig(d.data()||{});
}
async function subjectSelection(req,getSnapshot,trackId,audienceId){
 const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,trackId);
 const configuration=await configFor(track);
 const audience=safeConfig(configuration).audiences.find(x=>x.id===audienceId);
 if(!audience)throw deny(400,'Kies een geldige doelgroep voor deze specialisatie');
 const people=eligiblePlanningMembers(scope.roster,track.department)
  .filter(p=>planningAudienceMatch(p,track,audience));
 if(people.length>1000)throw deny(503,'Doelgroep te groot; beperk je selectie');
 return {track,configuration,audience,people,scope};
}
function publicPerson(p){
 return {discordId:p.personId,name:dateName(p.name)||'Onbekende medewerker',
  call:dateName(p.call),rank:dateName(p.rank),
  series:dateName(p.seriesRaw||p.series)};
}
async function allAvailableCourses(dept){
 const snapshot=await db().collection(PATHWAY_COLLECTION).where('department','==',dept).limit(201).get();
 if(snapshot.size>200)throw deny(503,'Opleidingscatalogus onvolledig');
 return [...new Set([...(TRAINING_REQUEST_COURSE_CATALOG[dept]||[]),
   ...snapshot.docs.filter(d=>d.get('active')!==false).map(d=>d.get('name'))
     .filter(x=>typeof x==='string')])];
}
function responseScope(track,config,actor){
 return {id:track.id,department:track.department,label:track.label,
  courses:[...new Set([...track.courses,...config.extraCourses])],
  canConfigureCourses:planningConfigurator(actor,track),
  audiences:safeConfig(config).audiences};
}
export function installTrainingPlanningRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/training-planning/context',requireUser,async(req,res)=>{
  try{
   const scope=await scoped(req,getSnapshot);
   const configsFound=await Promise.all(scope.tracks.map(configFor));
   const result=scope.tracks.map((t,i)=>responseScope(t,configsFound[i],req.bpd));
   // Every member sees only their own planning items, not colleagues' dossier.
   const own=await plans().where('subjectDiscordId','==',did(req)).limit(201).get();
   if(own.size>200)throw deny(503,'Eigen planningsoverzicht onvolledig');
   res.set('Cache-Control','private, no-store');
   res.json({tracks:result,mine:own.docs.map(d=>({id:d.id,...d.data()}))
    .map(x=>({id:x.id,trackId:x.trackId,trackLabel:x.trackLabel,
      courseName:x.courseName,status:x.status,plannedDay:x.plannedDay||'',
      note:x.note||'',department:x.department}))
    .filter(x=>x.status!=='geannuleerd')});
  }catch(e){error(res,e)}
 });
 app.get('/api/training-planning/people',requireUser,async(req,res)=>{
  try{
   const id=String(req.query?.trackId||''),aud=String(req.query?.audienceId||'alle');
   const {people,track,audience}=await subjectSelection(req,getSnapshot,id,aud);
   res.set('Cache-Control','private, no-store');
   res.json({trackId:track.id,department:track.department,audience,
    people:people.map(publicPerson)});
  }catch(e){error(res,e)}
 });
 app.get('/api/training-planning/assigned',requireUser,async(req,res)=>{
  try{
   const scope=await scoped(req,getSnapshot);
   const id=String(req.query?.trackId||'');
   const track=allowedTrack(scope,id);
   const result=await plans().where('trackId','==',track.id).limit(301).get();
   if(result.size>300)throw deny(503,'Planningsoverzicht te groot; kan niet volledig worden getoond');
   const actual=new Map(eligiblePlanningMembers(scope.roster,track.department)
     .map(p=>[p.personId,p]));
   res.set('Cache-Control','private, no-store');
   res.json({trackId:track.id,items:result.docs.map(d=>({id:d.id,...d.data()}))
    .filter(x=>actual.has(x.subjectDiscordId))
    .map(x=>({id:x.id,courseName:x.courseName,status:x.status,
      name:dateName(actual.get(x.subjectDiscordId).name),
      call:dateName(actual.get(x.subjectDiscordId).call),
      plannedDay:x.plannedDay||'',subjectDiscordId:x.subjectDiscordId,
      updatedAt:x.updatedAt?.toDate?.()?.toISOString()||null}))
    .sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/audiences',requireUser,async(req,res)=>{
  try{
   const data=validatePlanningAudience(req.body);
   const scope=await scoped(req,getSnapshot);
   const track=allowedTrack(scope,data.trackId);
   const ref=configs().doc(track.id),by=author(req),at=FieldValue.serverTimestamp();
   let id='';
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref),conf=ownConfig(snap.data()||{});
    if(conf.audiences.length>=20)throw deny(409,'Maximum 20 eigen doelgroepen per specialisatie');
    if(conf.audiences.some(a=>a.kind===data.kind&&keyName(a.value)===keyName(data.value)&&
       keyName(a.label)===keyName(data.label)))
      throw deny(409,'Deze doelgroep bestaat al');
    id='groep_'+hash(track.id+'|'+data.kind+'|'+keyName(data.value)+'|'+keyName(data.label)).slice(0,22);
    const audiences=[...conf.audiences,{id,...data}];
    tx.set(ref,{audiences,updatedAt:at},{merge:true});
    tx.create(ref.collection('audit').doc(),{type:'audience_created',id,by,at,body:data});
   });
   res.status(201).json({saved:true,id});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/audiences/remove',requireUser,async(req,res)=>{
  try{
   if(!bodyObject(req.body)||Object.keys(req.body).some(k=>!['trackId','audienceId'].includes(k)))
     throw deny(400,'Ongeldige doelgroep');
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,req.body.trackId);
   const id=req.body.audienceId;
   if(typeof id!=='string'||!/^groep_[a-f0-9]{22}$/.test(id))
     throw deny(400,'Alleen eigen doelgroepen kunnen worden verwijderd');
   const ref=configs().doc(track.id),by=author(req),at=FieldValue.serverTimestamp();
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref),conf=ownConfig(snap.data()||{});
    if(!conf.audiences.some(x=>x.id===id))throw deny(404,'Doelgroep niet gevonden');
    tx.set(ref,{audiences:conf.audiences.filter(x=>x.id!==id),updatedAt:at},{merge:true});
    tx.create(ref.collection('audit').doc(),{type:'audience_removed',id,by,at});
   });
   res.json({saved:true});
  }catch(e){error(res,e)}
 });
 app.get('/api/training-planning/catalog',requireUser,async(req,res)=>{
  try{
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,String(req.query?.trackId||''));
   if(!planningConfigurator(req.bpd,track))throw deny(403,'Alleen dienstleiding mag cursusrechten beheren');
   const available=await allAvailableCourses(track.department);
   const config=await configFor(track);
   res.set('Cache-Control','private, no-store');
   res.json({available,selected:config.extraCourses,defaults:track.courses});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/catalog',requireUser,async(req,res)=>{
  try{
   const data=req.body;
   if(!bodyObject(data)||Object.keys(data).some(x=>!['trackId','extraCourses'].includes(x))||
      !Array.isArray(data.extraCourses)||data.extraCourses.length>30||
      data.extraCourses.some(x=>typeof x!=='string'||x.length>150))
      throw deny(400,'Kies maximaal 30 bestaande opleidingen');
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,data.trackId);
   if(!planningConfigurator(req.bpd,track))throw deny(403,'Alleen dienstleiding mag cursusrechten wijzigen');
   const available=await allAvailableCourses(track.department);
   if(data.extraCourses.some(x=>!available.some(y=>keyName(y)===keyName(x))))
     throw deny(400,'Opleiding is niet beschikbaar voor deze dienst');
   const normalized=[...new Set(data.extraCourses.map(x=>
     available.find(y=>keyName(x)===keyName(y))))].filter(x=>
     !track.courses.some(y=>keyName(y)===keyName(x)));
   const ref=configs().doc(track.id),at=FieldValue.serverTimestamp(),by=author(req);
   const batch=db().batch();batch.set(ref,{extraCourses:normalized,updatedAt:at},{merge:true});
   batch.create(ref.collection('audit').doc(),{type:'course_scope_updated',
     extraCourses:normalized,by,at});
   await batch.commit();res.json({saved:true,courses:normalized});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/assign',requireUser,async(req,res)=>{
  try{
   const data=validatePlanningAssignment(req.body);
   const {track,people,configuration}=await subjectSelection(req,getSnapshot,
     data.trackId,data.audienceId);
   if(!planningCourseAllowed(data.courseName,track,configuration))
     throw deny(403,'Deze opleider mag de gekozen opleiding niet plannen');
   const personMap=new Map(people.map(p=>[p.personId,p]));
   if(data.subjectIds.some(id=>!personMap.has(id)))
     throw deny(403,'Eén of meer gekozen personen horen niet tot deze doelgroep');
   const at=FieldValue.serverTimestamp(),by=author(req);
   const refs=data.subjectIds.map(id=>plans().doc(
     planningAssignmentKey(track.id,data.courseName,id,hash)));
   await db().runTransaction(async tx=>{
    const existing=await Promise.all(refs.map(ref=>tx.get(ref)));
    for(let i=0;i<refs.length;i++){
     const subject=personMap.get(data.subjectIds[i]),old=existing[i];
     const current={department:track.department,trackId:track.id,
       trackLabel:track.label,courseName:data.courseName,
       subjectDiscordId:subject.personId,subjectName:dateName(subject.name),
       subjectCall:dateName(subject.call),audienceId:data.audienceId,
       status:data.status,plannedDay:data.plannedDay,note:data.note,
       assignedBy:by.discordId,updatedAt:at};
     if(old.exists)tx.update(refs[i],current);
     else tx.create(refs[i],{...current,createdAt:at});
     tx.create(refs[i].collection('audit').doc(),
       {type:old.exists?'planning_updated':'planning_assigned',by,at,
        status:data.status,plannedDay:data.plannedDay,audienceId:data.audienceId,
        previousStatus:old.exists?old.get('status')||null:null});
    }
   });
   res.json({saved:true,participants:data.subjectIds.length,status:data.status,
     note:'Planning verleent geen specialisatie, kwalificatie of verplichte opleidingsstatus'});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/cancel',requireUser,async(req,res)=>{
  try{
   const id=String(req.body?.id||''),trackId=String(req.body?.trackId||'');
   if(!/^[a-f0-9]{36}$/.test(id)||!planningTrack(trackId))
     throw deny(400,'Ongeldige opleidingstoewijzing');
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,trackId);
   const ref=plans().doc(id),at=FieldValue.serverTimestamp(),by=author(req);
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists||snap.get('trackId')!==track.id)
      throw deny(404,'Planning niet gevonden voor deze specialisatie');
    tx.update(ref,{status:'geannuleerd',updatedAt:at});
    tx.create(ref.collection('audit').doc(),{type:'planning_cancelled',by,at,
      previousStatus:snap.get('status')||null});
   });
   res.json({saved:true});
  }catch(e){error(res,e)}
 });
}
